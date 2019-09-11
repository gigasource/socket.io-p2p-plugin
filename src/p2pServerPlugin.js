const {SOCKET_EVENT} = require('./util/constants');

class P2pServerManager {
  constructor() {
    this.clientMap = {};
  }

  addClient(clientId, clientSocketId) {
    if (clientId) {
      this.clientMap[clientId] = clientSocketId;
    }
  }

  removeClient(clientId) {
    delete this.clientMap[clientId];
  }

  getClientSocketId(clientId) {
    return this.clientMap[clientId];
  }

  getAllClientId() {
    return Object.keys(this.clientMap);
  }
}

module.exports = function p2pServerPlugin(io) {
  const p2pServerManager = new P2pServerManager();

  io.on('connect', (socket) => {
    const {clientId} = socket.request._query;
    p2pServerManager.addClient(clientId, socket.id);

    //lifecycle
    socket.on('disconnect', reason => {
      p2pServerManager.removeClient(clientId);
    });

    socket.on('reconnect', attemptNumber => {
      p2pServerManager.addClient(clientId, socket.id);
    });

    socket.on(SOCKET_EVENT.P2P_REGISTER, (targetClientId, clientCallbackFn) => {
      const targetClientSocketId = p2pServerManager.getClientSocketId(targetClientId);
      const targetClientSocket = io.sockets.connected[targetClientSocketId];

      if (!targetClientSocketId) {
        // targetAvailable = false; (client is not currently online)
        clientCallbackFn(false);
        return;
      }

      targetClientSocket.once(SOCKET_EVENT.P2P_REGISTER_SUCCESS, () => {
        socket.once('disconnect', () => targetClientSocket.emit(SOCKET_EVENT.P2P_DISCONNECT));
        targetClientSocket.once('disconnect', () => socket.emit(SOCKET_EVENT.P2P_DISCONNECT));

        // targetAvailable = true; (successful connection)
        clientCallbackFn(true);
      });

      targetClientSocket.once(SOCKET_EVENT.P2P_REGISTER_FAILED, () => {
        // targetAvailable = false; (target client declined the connection)
        clientCallbackFn(false);
      });

      targetClientSocket.emit(SOCKET_EVENT.P2P_REGISTER, clientId);
    });

    socket.on(SOCKET_EVENT.P2P_EMIT, ({targetClientId, event, args}) => {
      const targetClientSocketId = p2pServerManager.getClientSocketId(targetClientId);
      const targetClientSocket = io.sockets.connected[targetClientSocketId];

      console.log(socket.id, SOCKET_EVENT.P2P_EMIT, 'target id: ', targetClientId, 'event:', event, '...args:', ...args)
      targetClientSocket.emit(event, ...args);
    });

    socket.on(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE, ({targetClientId, event, args}, acknowledgeFn) => {
      const targetClientSocketId = p2pServerManager.getClientSocketId(targetClientId);
      const targetClientSocket = io.sockets.connected[targetClientSocketId];

      targetClientSocket.emit(event, ...args, acknowledgeFn);
    });

    socket.on(SOCKET_EVENT.LIST_CLIENTS, (clientCallbackFn) => {
      clientCallbackFn(p2pServerManager.getAllClientId());
    });
  });
};
