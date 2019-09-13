const expect = require('expect.js');
const {SOCKET_EVENT} = require('../../src/util/constants');
const {startServer, stopServer, startClient, wait} = require('./common');

const client1Id = 'A';
const client2Id = 'B';
const client3Id = 'C';

let client1;
let client2;
let client3;
let server;

beforeEach(async function () {
  server = startServer();
  client1 = startClient(client1, client1Id);
  client2 = startClient(client2, client2Id);
  client3 = startClient(client3, client3Id);
  await wait(200);
});

after(function () {
  stopServer();
});

describe('p2p-server-plugin', function () {
  describe('p2pServerManager', function () {
    it('should create \'connect\' event listeners on initialization', async function () {
      expect(server.listeners('connect')).to.have.length(1);
    });
    it('should create correct number of sockets', async function () {
      expect(Object.keys(server.sockets.sockets)).to.have.length(3);
    });
    it('should create necessary event listeners for each socket', async function () {
      Object.keys(server.sockets.sockets).forEach((key) => {
        const socket = server.sockets.sockets[key];
        expect(socket.listeners('disconnect')).to.have.length(1);
        expect(socket.listeners('reconnect')).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_EMIT)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_REGISTER)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.LIST_CLIENTS)).to.have.length(1);
      });
    });
    it('should not create post-register event listeners before clients connect', async function () {
      Object.keys(server.sockets.sockets).forEach((key) => {
        const socket = server.sockets.sockets[key];
        expect(socket.listeners('disconnect')).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_REGISTER_SUCCESS)).to.have.length(0);
        expect(socket.listeners(SOCKET_EVENT.P2P_REGISTER_FAILED)).to.have.length(0);
        expect(socket.listeners(SOCKET_EVENT.P2P_UNREGISTER)).to.have.length(0);
      });
    });
    it('should create post-register event listeners after clients connect', async function () {
      await client1.registerP2pTarget(client2Id);

      const keys = [server.getClientSocketId(client1Id), server.getClientSocketId(client2Id)];

      keys.forEach((key) => {
        const socket = server.sockets.sockets[key];
        expect(socket.listeners('disconnect')).to.have.length(2); // 1 extra 'disconnect' listener after registering
        expect(socket.listeners('reconnect')).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_EMIT)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_REGISTER)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.LIST_CLIENTS)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_UNREGISTER)).to.have.length(1); // post-register listener
      });
    });
    it('should not create post-register event listeners if client fails to register', async function () {
      await client1.registerP2pTarget(client2Id);

      const keys = [server.getClientSocketId(client1Id), server.getClientSocketId(client2Id)];

      keys.forEach((key) => {
        const socket = server.sockets.sockets[key];
        expect(socket.listeners('disconnect')).to.have.length(2); // 1 extra 'disconnect' listener after registering
        expect(socket.listeners('reconnect')).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_EMIT)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_REGISTER)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.LIST_CLIENTS)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_UNREGISTER)).to.have.length(1); // post-register listener
      });

      await client3.registerP2pTarget(client2Id);
      const client3Socket = server.sockets.sockets[server.getClientSocketId(client3Id)];
      expect(client3Socket.listeners('disconnect')).to.have.length(1);
      expect(client3Socket.listeners('reconnect')).to.have.length(1);
      expect(client3Socket.listeners(SOCKET_EVENT.P2P_EMIT)).to.have.length(1);
      expect(client3Socket.listeners(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE)).to.have.length(1);
      expect(client3Socket.listeners(SOCKET_EVENT.P2P_REGISTER)).to.have.length(1);
      expect(client3Socket.listeners(SOCKET_EVENT.LIST_CLIENTS)).to.have.length(1);
      expect(client3Socket.listeners(SOCKET_EVENT.P2P_UNREGISTER)).to.have.length(0);
    });
    it('should remove post-register event listeners if a client in connection unregisters', async function () {
      await client1.registerP2pTarget(client2Id);
      const keys = [server.getClientSocketId(client1Id), server.getClientSocketId(client2Id)];
      await wait(200);

      keys.forEach((key) => {
        const socket = server.sockets.sockets[key];
        expect(socket.listeners('disconnect')).to.have.length(2); // 1 extra 'disconnect' listener after registering
        expect(socket.listeners('reconnect')).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_EMIT)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_REGISTER)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.LIST_CLIENTS)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_UNREGISTER)).to.have.length(1); // post-register listener
      });

      await client2.unregisterP2pTarget();
      keys.forEach((key) => {
        const socket = server.sockets.sockets[key];
        expect(socket.listeners('disconnect')).to.have.length(1); // 1 extra 'disconnect' listener after registering
        expect(socket.listeners('reconnect')).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_EMIT)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_REGISTER)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.LIST_CLIENTS)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_UNREGISTER)).to.have.length(0); // post-register listener
      });
    });
    it('should remove post-register event listeners if a client in connection disconnects', async function () {
      await client1.registerP2pTarget(client2Id);
      const keys = [server.getClientSocketId(client1Id), server.getClientSocketId(client2Id)];

      keys.forEach((key) => {
        const socket = server.sockets.sockets[key];
        expect(socket.listeners('disconnect')).to.have.length(2); // 1 extra 'disconnect' listener after registering
        expect(socket.listeners('reconnect')).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_EMIT)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_REGISTER)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.LIST_CLIENTS)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_UNREGISTER)).to.have.length(1); // post-register listener
      });

      client2.disconnect();
      await wait(200);
      const client1Socket = server.sockets.sockets[server.getClientSocketId(client1Id)];
      expect(client1Socket.listeners('disconnect')).to.have.length(1);
      expect(client1Socket.listeners('reconnect')).to.have.length(1);
      expect(client1Socket.listeners(SOCKET_EVENT.P2P_EMIT)).to.have.length(1);
      expect(client1Socket.listeners(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE)).to.have.length(1);
      expect(client1Socket.listeners(SOCKET_EVENT.P2P_REGISTER)).to.have.length(1);
      expect(client1Socket.listeners(SOCKET_EVENT.LIST_CLIENTS)).to.have.length(1);
      expect(client1Socket.listeners(SOCKET_EVENT.P2P_UNREGISTER)).to.have.length(0);
    });

    describe('custom functions', function () {
      it('should exist', function () {
        expect(server.getClientSocketId).to.be.a('function');
        expect(server.getAllClientId).to.be.a('function');
        expect(server.findClientIdBySocketId).to.be.a('function');
      });

      describe('getClientSocketId function', function () {
        it('should be able to get socket ID of connected clients', async function () {
          const client1SocketId = server.getClientSocketId(client1Id);
          const client2SocketId = server.getClientSocketId(client2Id);
          const client3SocketId = server.getClientSocketId(client3Id);

          expect(client1SocketId).to.be.ok();
          expect(client2SocketId).to.be.ok();
          expect(client3SocketId).to.be.ok();
        });
        it('should return undefined if client ID is not registered to the server', function () {
          const client4SocketId = server.getClientSocketId('D');
          expect(client4SocketId).to.be(undefined);
        });
        it('should update correctly if clients disconnect', async function () {
          let client1SocketId = server.getClientSocketId(client1Id);
          expect(client1SocketId).to.be.ok();

          client1.disconnect();
          await wait(500);
          client1SocketId = server.getClientSocketId(client1Id);
          expect(client1SocketId).to.be(undefined);
        })
      })
      describe('getAllClientId function', function () {
        it('should be able to list all IDs of connected clients', async function () {
          const idArray = server.getAllClientId();
          expect(idArray).to.contain(client1Id);
          expect(idArray).to.contain(client2Id);
          expect(idArray).to.contain(client3Id);
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
        })
      });
      describe('findClientIdBySocketId function', function () {
        it('should be able to return correct id of a client from a socket id', function () {
          const client1SocketId = server.getClientSocketId(client1Id);
          const c1Id = server.findClientIdBySocketId(client1SocketId);
          expect(c1Id).to.be(client1Id);
        });
        it('should return undefined if socket id does not exist', function () {
          const c1Id = server.findClientIdBySocketId('socketId12345');
          expect(c1Id).to.be(undefined);
        });
      })
    })
  })
})
