const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;
const {startServer, wait, terminateClients} = require('../../common');
chai.use(chaiAsPromised);

const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync('saved-messages.json');
const db = low(adapter);
db.defaults({savedMessages: {}}).write();
const uuidv1 = require('uuid/v1');
const socketClient = require('socket.io-client');
const socketClientPlugin = require('../../../../src/p2p-client-plugin');

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

describe('Redis adapter test', function () {
  let server1, server2;
  let client1, client2;

  before(async function () {
    server1 = startServer({saveMessage, loadMessages, deleteMessage, redisTest: true});
    server2 = startServer({saveMessage, loadMessages, deleteMessage, redisTest: true});
  });

  after(function () {
    server1.cleanup();
    server2.cleanup();
  });

  beforeEach(async function () {
    const clientId1 = uuidv1();
    const clientId2 = uuidv1();

    const rawSocket1 = socketClient.connect(`http://localhost:${server1.port}?clientId=${clientId1}`);
    const rawSocket2 = socketClient.connect(`http://localhost:${server2.port}?clientId=${clientId2}`);

    client1 = socketClientPlugin(rawSocket1, clientId1);
    client2 = socketClientPlugin(rawSocket2, clientId2);

    await wait(200);
  });

  afterEach(async function () {
    terminateClients(client1, client2);
    await wait(200);
  });

  describe('when Socket.io Redis adapter is used', function () {
    describe('emitTo function', function () {
      it('should be able to send message between nodes', function (done) {
        // client1 is connected to server1, client2 - server2
        // now we test sending message from server1 to client2 with emitTo
        let result1 = '';
        let result2 = 0;
        const testEvent = 'getNews';
        const randomNumber1 = Math.random().toFixed(2);
        const randomNumber2 = Math.random().toFixed(2);
        const randomNumber3 = Math.random().toFixed(2);
        const randomNumber4 = Math.random().toFixed(2);
        const randomNumber5 = Math.random().toFixed(2);
        const randomNumber6 = Math.random().toFixed(2);

        client1.on(testEvent, (data1, data2, cb) => {
          result1 += 'data from client 1';
          result2 = data1 + data2;
          cb(randomNumber3, randomNumber4);
        });

        client2.on(testEvent, (data1, data2, cb) => {
          result1 += 'client 2 sends data';
          result2 = data1 + data2;
          cb(randomNumber5, randomNumber6);
        });

        server1.emitTo(client2.clientId, testEvent, randomNumber1, randomNumber2, (arg1, arg2) => {
          expect(result1).to.equal('client 2 sends data');
          expect(result2).to.equal(randomNumber1 + randomNumber2);
          expect(arg1).to.equal(randomNumber5);
          expect(arg2).to.equal(randomNumber6);
          done();
        })
      });
    });
    describe('emitToPersistent function', function () {
      describe('should be able to send message between nodes', function () {
        it('should send message immediately if client is already connected', function (done) {
          let result1 = '';
          let result2 = 0;
          const testEvent = 'getPosts';
          const testEventAck = 'getPostsAck';
          const randomNumber1 = Math.random().toFixed(2);
          const randomNumber2 = Math.random().toFixed(2);
          const randomNumber3 = Math.random().toFixed(2);
          const randomNumber4 = Math.random().toFixed(2);
          const randomNumber5 = Math.random().toFixed(2);
          const randomNumber6 = Math.random().toFixed(2);
          const randomNumber7 = Math.random().toFixed(2);
          const randomNumber8 = Math.random().toFixed(2);


          client1.on(testEvent, (data1, data2, cb) => {
            result1 += 'posts are returned from client 1';
            result2 = data1 + data2;
            cb(randomNumber5, randomNumber6);
          });

          client2.on(testEvent, (data1, data2, cb) => {
            result1 += 'client 2 returns 5 posts';
            result2 = data1 + data2;
            cb(randomNumber7, randomNumber8);
          });

          server1.registerAckFunction(testEventAck, (arg1, arg2, arg3, arg4) => {
            expect(arg1).to.equal(randomNumber3);
            expect(arg2).to.equal(randomNumber4);
            expect(arg3).to.equal(randomNumber7);
            expect(arg4).to.equal(randomNumber8);
            expect(result1).to.equal('client 2 returns 5 posts');
            expect(result2).to.equal(randomNumber1 + randomNumber2);
            done();
          });

          server1.emitToPersistent(client2.clientId, testEvent, [randomNumber1, randomNumber2],
              testEventAck, [randomNumber3, randomNumber4]);
        });
        it('should save message and send later when client connects', function (done) {
          // client3 will connect to server1, client4 - server2
          let client3, client4;
          const clientId3 = uuidv1();
          const clientId4 = uuidv1();

          let result1 = '';
          let result2 = 0;
          const testEvent = 'getUsers';
          const testEventAck = 'getUsersAck';
          const randomNumber1 = Math.random().toFixed(2);
          const randomNumber2 = Math.random().toFixed(2);
          const randomNumber3 = Math.random().toFixed(2);
          const randomNumber4 = Math.random().toFixed(2);
          const randomNumber5 = Math.random().toFixed(2);
          const randomNumber6 = Math.random().toFixed(2);
          const randomNumber7 = Math.random().toFixed(2);
          const randomNumber8 = Math.random().toFixed(2);

          server1.registerAckFunction(testEventAck, (arg1, arg2, arg3, arg4) => {
            expect(arg1).to.equal(randomNumber3);
            expect(arg2).to.equal(randomNumber4);
            expect(arg3).to.equal(randomNumber7);
            expect(arg4).to.equal(randomNumber8);
            expect(result1).to.equal('client 4 sends data');
            expect(result2).to.equal(randomNumber1 + randomNumber2);

            client3.disconnect();
            client3.destroy();
            client4.disconnect();
            client4.destroy();
            done();
          });

          server1.emitToPersistent(clientId4, testEvent, [randomNumber1, randomNumber2],
              testEventAck, [randomNumber3, randomNumber4]);

          setTimeout(() => {
            client3 = socketClient.connect(`http://localhost:${server1.port}?clientId=${clientId3}`);
            client3.on(testEvent, (data1, data2, cb) => {
              result1 += 'data from client 3';
              result2 = data1 + data2;
              cb(randomNumber5, randomNumber6);
            });

            client4 = socketClient.connect(`http://localhost:${server2.port}?clientId=${clientId4}`);
            client4.on(testEvent, (data1, data2, cb) => {
              result1 += 'client 4 sends data';
              result2 = data1 + data2;
              cb(randomNumber7, randomNumber8);
            });
          }, 1000);
        });
      });
    });
    describe('clients between nodes', function () {
      it('should be able to send p2p messages ', function (done) {
        const testEvent = uuidv1();
        const testPayload1 = Math.random();
        const testPayload2 = Math.random();
        const testPayload3 = Math.random();
        const testPayload4 = Math.random();

        client2.on(testEvent, (data1, data2, cb) => {
          expect(data1).to.equal(testPayload1);
          expect(data2).to.equal(testPayload2);
          cb(testPayload3, testPayload4);
        });

        client1.emitTo(client2.clientId, testEvent, testPayload1, testPayload2, (ackData1, ackData2) => {
          expect(ackData1).to.equal(testPayload3);
          expect(ackData2).to.equal(testPayload4);
          done();
        });
      });
      /*it('should be able to send data through stream', async function () {
        let duplex1, duplex2;
        const result = [];
        client2.onAddP2pStream({}, d => duplex2 = d);
        duplex1 = await client1.addP2pStream(client2.clientId, {});

        duplex2.on('data', chunk => result.push(chunk.toString()));
        const inputArr = [...new Array(40)].map(() => Math.round(Math.random() * 100) + '');
        streamify(inputArr).pipe(duplex1);

        await wait(200);
        expect(result).to.have.lengthOf(inputArr.length);
        expect(result[0]).to.equal(inputArr[0]);
        expect(result[result.length - 1]).to.equal(inputArr[result.length - 1]);
      });*/
    });
  });
});
