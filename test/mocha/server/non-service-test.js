const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;
const {SOCKET_EVENT} = require('../../../src/util/constants');
const {startServer, stopServer, startClients, wait, terminateClients} = require('../common');
chai.use(chaiAsPromised);

describe('p2p-server-plugin', function () {
  const numberOfClients = 3;

  let client1, client2, client3;
  let server;

  before(async function () {
    server = startServer();
  });

  after(function () {
    stopServer();
  });

  beforeEach(async function () {
    [client1, client2, client3] = startClients(numberOfClients);
    await wait(200);
  });

  afterEach(async function () {
    terminateClients(client1, client2, client3);
    await wait(200);
  });

  describe('when the server is created with isService === false', function () {
    it('should create \'connect\' event listeners on initialization', function () {
      expect(server.listeners('connect')).to.have.length(1);
    });
    it('should create necessary event listeners for each socket', function () {
      Object.keys(server.sockets.sockets).forEach((key) => {
        const socket = server.sockets.sockets[key];
        expect(socket.listeners('disconnect')).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_EMIT)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.JOIN_ROOM)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.LEAVE_ROOM)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.EMIT_ROOM)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.ADD_TARGET)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.CREATE_STREAM)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.LIST_CLIENTS)).to.have.length(1);
      });
    });
    it('should create correct number of sockets',  function () {
      expect(Object.keys(server.sockets.sockets)).to.have.length(3);
    });
    it('should remove disconnected sockets', async function () {
      client1.disconnect();
      client2.disconnect();
      client3.disconnect();
      await wait(200);

      expect(Object.keys(server.sockets.sockets)).to.have.length(0);
    });

    describe('custom functions', function () {
      it('should exist', function () {
        expect(server.getSocketIdByClientId).to.be.a('function');
        expect(server.getAllClientId).to.be.a('function');
        expect(server.getClientIdBySocketId).to.be.a('function');
      });

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
          await wait(200);
          idArray = server.getAllClientId();
          expect(idArray).to.have.length(2);

          client3.disconnect();
          await wait(200);
          idArray = server.getAllClientId();
          expect(idArray).to.have.length(1);

          client2.disconnect();
          await wait(200);
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
    });
  });
});
