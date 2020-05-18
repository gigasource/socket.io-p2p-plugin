const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;
const {SOCKET_EVENT} = require('../../../src/util/constants');
const {startServer, stopServer, startClients, wait, terminateClients, getCurrentServerPort} = require('../common');
chai.use(chaiAsPromised);

const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync('saved-messages.json');
const db = low(adapter);
db.defaults({savedMessages: {}}).write();
const uuidv1 = require('uuid/v1');
const socketClient = require('socket.io-client');

function saveToDb(targetClientId, value) {
  db.set(`savedMessages.${targetClientId}`, value).write();
}

function loadFromDb(targetClientId) {
  return db.read().get(`savedMessages.${targetClientId}`).value() || [];
}

function saveMessage(targetClientId, message) {
  message._id = uuidv1();

  const savedMessages = loadFromDb(targetClientId);
  savedMessages.push(message);

  saveToDb(targetClientId, savedMessages);
  return message._id;
}

function deleteMessage(targetClientId, _id) {
  let savedMessages = loadFromDb(targetClientId);
  saveToDb(targetClientId, savedMessages.filter(msg => msg._id !== _id));
}

function loadMessages(targetClientId) {
  return loadFromDb(targetClientId);
}

describe('Server Core API', function () {
  const numberOfClients = 3;

  let client1, client2, client3;
  let server;

  before(async function () {
    server = startServer({saveMessage, loadMessages, deleteMessage});
  });

  after(function () {
    stopServer();
  });

  beforeEach(async function () {
    [client1, client2, client3] = startClients(numberOfClients);
    await wait(300);
  });

  afterEach(async function () {
    terminateClients(client1, client2, client3);
    await wait(300);
  });

  describe('when the server is created', function () {
    it('should create \'connect\' event listeners on initialization', function () {
      expect(server.listeners('connect')).to.have.length(1);
    });
    it('should create necessary event listeners for each socket', function () {
      Object.keys(server.sockets.sockets).forEach((key) => {
        const socket = server.sockets.sockets[key];
        expect(socket.listeners(SOCKET_EVENT.P2P_EMIT)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.JOIN_ROOM)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.LEAVE_ROOM)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.EMIT_ROOM)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.ADD_TARGET)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.CREATE_STREAM)).to.have.length(1);
      });
    });
    it('should create correct number of sockets', function () {
      expect(Object.keys(server.sockets.sockets)).to.have.length(3);
    });
    it('should remove disconnected sockets', async function () {
      client1.disconnect();
      client2.disconnect();
      client3.disconnect();
      await wait(300);

      expect(Object.keys(server.sockets.sockets)).to.have.length(0);
    });

    describe('custom functions', function () {
      describe('getSocketIdByClientId function', function () {
        it('should be able to get socket ID of connected clients', function () {
          const client1SocketId = server.getSocketIdByClientId(client1.clientId);
          const client2SocketId = server.getSocketIdByClientId(client2.clientId);
          const client3SocketId = server.getSocketIdByClientId(client3.clientId);

          expect(client1SocketId).to.be.ok;
          expect(client2SocketId).to.be.ok;
          expect(client3SocketId).to.be.ok;
        });
        it('should return undefined if client ID is not registered to the server', function () {
          const client4SocketId = server.getSocketIdByClientId('D');
          expect(client4SocketId).to.equal(undefined);
        });
        it('should update correctly if clients disconnect', async function () {
          let client1SocketId = server.getSocketIdByClientId(client1.clientId);
          expect(client1SocketId).to.be.ok;

          client1.disconnect();
          await wait(500);
          client1SocketId = server.getSocketIdByClientId(client1.clientId);
          expect(client1SocketId).to.equal(undefined);
        });
      });

      describe('getAllClientId function', function () {
        it('should be able to list all IDs of connected clients', function () {
          const idArray = server.getAllClientId();
          expect(idArray).to.contain(client1.clientId);
          expect(idArray).to.contain(client2.clientId);
          expect(idArray).to.contain(client3.clientId);
          expect(idArray).to.not.contain('D');
        });
        it('should update correctly if clients disconnect', async function () {
          let idArray = server.getAllClientId();
          expect(idArray).to.have.length(3);

          client1.disconnect();
          await wait(300);
          idArray = server.getAllClientId();
          expect(idArray).to.have.length(2);

          client3.disconnect();
          await wait(300);
          idArray = server.getAllClientId();
          expect(idArray).to.have.length(1);

          client2.disconnect();
          await wait(300);
          idArray = server.getAllClientId();
          expect(idArray).to.have.length(0);
        });
      });

      describe('getClientIdBySocketId function', function () {
        it('should be able to return correct id of a client from a socket id', function () {
          const client1SocketId = server.getSocketIdByClientId(client1.clientId);
          const c1Id = server.getClientIdBySocketId(client1SocketId);
          expect(c1Id).to.equal(client1.clientId);
        });
        it('should return undefined if socket id does not exist', function () {
          const c1Id = server.getClientIdBySocketId('socketId12345');
          expect(c1Id).to.equal(undefined);
        });
      });

      describe('emitTo function', function () {
        it('should be able to send data to connected client', function (done) {
          const testEvent = 'notification';

          client1.on(testEvent, done);

          server.emitTo(client1.clientId, testEvent);
        });
        it('should send data to correct client', async function () {
          const testEvent = 'notification';
          let count = 0;

          client1.on(testEvent, () => count++);
          client2.on(testEvent, () => count++);
          client3.on(testEvent, () => count++);

          server.emitTo(client3.clientId, testEvent);
          await wait(300);

          expect(count).to.equal(1);
        });
        it('should be able to send data with ack', function (done) {
          const testEvent = 'getNews';

          client1.on(testEvent, callback => callback('abc'));

          server.emitTo(client1.clientId, testEvent, ackValue => {
            expect(ackValue).to.equal('abc');
            done();
          });
        });
      });

      describe('emitToPersistent function', function () {
        it('should be able to send data to connected client immediately', function (done) {
          const testEvent = 'testPersistent';

          client1.on(testEvent, callback => {
            callback();
            done();
          });

          server.emitToPersistent(client1.clientId, testEvent);
        });
        it('should save message if client is not connected and send it when client connects', function (done) {
          const testEvent = 'testPersistent';
          const newClientId = uuidv1();

          server.emitToPersistent(newClientId, testEvent);

          setTimeout(() => {
            const newClient = socketClient(`http://localhost:${getCurrentServerPort()}?clientId=${newClientId}`);
            newClient.on(testEvent, deleteSavedMessageCallback => {
              deleteSavedMessageCallback();

              // Cleanup created object to avoid affecting other tests
              newClient.disconnect();
              newClient.destroy();
              // -----------------------------------------------------

              done();
            });
          }, 50);
        });
        describe('should trigger ack function registered by registerAckFunction if client sends ack', function () {
          it('when message is sent immediately', function (done) {
            const testEvent = 'testPersistent';
            const testEventAck = 'testPersistentAck';
            const randomValues = Array.from({length: 4}, Math.random);

            client1.on(testEvent, (...args) => {
              expect(args.length).to.equal(3); // last arg is an ack function used for deleting saved message

              const [val1, val2, callback] = args;
              callback(val2, val1);
            });

            server.registerAckFunction(testEventAck, (...args) => {
              expect(args.length).to.equal(4); // emitToPersistent can pass extra args to ack function (using Array.unshift)
              expect(args[0]).to.equal(randomValues[3]);
              expect(args[1]).to.equal(randomValues[2]);
              expect(args[2]).to.equal(randomValues[1]);
              expect(args[3]).to.equal(randomValues[0]);

              // Cleanup for other tests
              server.unregisterAckFunction(testEventAck);
              done();
            });

            server.emitToPersistent(client1.clientId, testEvent, [randomValues[0], randomValues[1]],
                testEventAck, [randomValues[3], randomValues[2]]);
          });
          it('when message is saved and sent later', function (done) {
            const testEvent = 'testPersistent';
            const testEventAck = 'testPersistentAck';
            const randomValues = Array.from({length: 4}, Math.random);
            const newClientId = uuidv1();
            let newClient;

            server.registerAckFunction(testEventAck, (...args) => {
              expect(args.length).to.equal(4); // emitToPersistent can pass extra args to ack function (using Array.unshift)
              expect(args[0]).to.equal(randomValues[3]);
              expect(args[1]).to.equal(randomValues[2]);
              expect(args[2]).to.equal(randomValues[1]);
              expect(args[3]).to.equal(randomValues[0]);

              // Cleanup created object to avoid affecting other tests
              server.unregisterAckFunction(testEventAck);
              newClient.disconnect();
              newClient.destroy();
              // -----------------------------------------------------

              done();
            });

            server.emitToPersistent(newClientId, testEvent, [randomValues[0], randomValues[1]],
                testEventAck, [randomValues[3], randomValues[2]]);

            setTimeout(() => {
              newClient = socketClient(`http://localhost:${getCurrentServerPort()}?clientId=${newClientId}`);
              newClient.on(testEvent, (...args) => {
                expect(args.length).to.equal(3); // last arg is an ack function used for deleting saved message

                const [val1, val2, callback] = args;
                callback(val2, val1);
              });
            }, 300);
          });
        });
        describe('should not trigger unregistered ack function', function () {
          it('when message is sent', async function () {
            const testEvent = 'testPersistent';
            const testEventAck = 'testPersistentAck';
            let count = 0;

            client1.on(testEvent, callback => {
              callback();
            });

            const cb1 = () => count += 10;
            const cb2 = () => count += 100;
            const cb3 = () => count += 1000;

            server.registerAckFunction(testEventAck, cb1);
            server.registerAckFunction(testEventAck, cb2);
            server.registerAckFunction(testEventAck, cb3); // ack can be registered multiple times
            server.unregisterAckFunction(testEventAck, cb2);

            server.emitToPersistent(client1.clientId, testEvent, null, testEventAck, null);
            await wait(300);

            expect(count).to.equal(10 + 1000); // cb2 is unregistered
            server.unregisterAckFunction(testEventAck, cb1);

            server.emitToPersistent(client1.clientId, testEvent, null, testEventAck, null);
            await wait(300);

            expect(count).to.equal(1010 + 1000); // cb1 is unregistered
            server.unregisterAckFunction(testEventAck, cb3);

            server.emitToPersistent(client1.clientId, testEvent, null, testEventAck, null);
            await wait(300);

            // Cleanup for other tests
            server.unregisterAckFunction(testEventAck);
            expect(count).to.equal(2010); // cb3 is unregistered
          });
        });
      });
    });
    describe('server settings options', function () {
      describe('clientOverwrite option', function () {
        it('should disconnect new client with duplicated clientId if clientOverwrite === false', function (done) {
          // clientOverwrite = false by default
          const clientId = uuidv1();
          const testEvent = 'createNews';
          let result = 0;
          let connectedClients = 0;
          let testClient1, testClient2;

          testClient1 = socketClient.connect(`http://localhost:${server.port}?clientId=${clientId}`);

          testClient1.once('connect', () => {
            connectedClients++;
            testClient1.on(testEvent, cb => {
              result += 123
              cb();
            });
            sendData();
          });

          setTimeout(() => {
            testClient2 = socketClient.connect(`http://localhost:${server.port}?clientId=${clientId}`);

            testClient2.once('connect', () => {
              connectedClients++;
              testClient2.on(testEvent, cb => {
                result += 456
                cb();
              });
              setTimeout(sendData, 200);
            });
          }, 500);

          function sendData() {
            if (connectedClients < 2) return;

            server.emitTo(clientId, testEvent, () => {
              expect(testClient1.connected).to.equal(true);
              expect(testClient2.connected).to.equal(false);
              // cleanup
              testClient1.disconnect();
              testClient2.disconnect();

              expect(result).to.equal(123);
              done();
            });
          }
        });
        it('should disconnect old client and add new client with duplicated clientId if clientOverwrite === true', function (done) {
          const testServer = startServer({saveMessage, loadMessages, deleteMessage, clientOverwrite: true});
          const clientId = uuidv1();
          const testEvent = 'createNews';
          let result = 0;
          let connectedClients = 0;
          let testClient1, testClient2;

          testClient1 = socketClient.connect(`http://localhost:${testServer.port}?clientId=${clientId}`);

          testClient1.once('connect', () => {
            connectedClients++;
            testClient1.on(testEvent, cb => {
              result += 123
              cb();
            });
            sendData();
          });

          setTimeout(() => {
            testClient2 = socketClient.connect(`http://localhost:${testServer.port}?clientId=${clientId}`);

            testClient2.once('connect', () => {
              connectedClients++;
              testClient2.on(testEvent, cb => {
                result += 456
                cb();
              });
              setTimeout(sendData, 200);
            });
          }, 500);

          function sendData() {
            if (connectedClients < 2) return;

            testServer.emitTo(clientId, testEvent, () => {
              expect(testClient1.connected).to.equal(false);
              expect(testClient2.connected).to.equal(true);
              // cleanup
              testClient1.disconnect();
              testClient2.disconnect();
              testServer.cleanup();

              expect(result).to.equal(456);
              done();
            });
          }
        });
      });
    });
  });
});
