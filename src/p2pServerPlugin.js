const {SOCKET_EVENT} = require('./util/constants');
const findKey = require('lodash/findKey');

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

  findClientIdBySocketId(socketId) {
    return findKey(this.clientMap, (v) => v === socketId);
  }
}

module.exports = function p2pServerPlugin(io) {
  const p2pServerManager = new P2pServerManager();

  io.on('connect', (socket) => {
    const {clientId} = socket.request._query;
    p2pServerManager.addClient(clientId, socket.id);

    const throwError = (err) => {
      console.error(err);
      socket.emit(SOCKET_EVENT.SERVER_ERROR, err.toString());
      console.log(socket.id + ' ' + p2pServerManager.findClientIdBySocketId(socket.id));
    }

    const findTargetClientSocket = (targetClientId) => {
      const targetClientSocket = io.sockets.connected[p2pServerManager.getClientSocketId(targetClientId)];
      if (!targetClientSocket)
        throwError(new Error(`Could not find target client ${targetClientId} socket, client is not registered to the server`));
      return targetClientSocket;
    }

    const removePostRegisterListeners = () => {
      socket.removeAllListeners(SOCKET_EVENT.P2P_UNREGISTER);
      socket.removeAllListeners(SOCKET_EVENT.P2P_EMIT);
      socket.removeAllListeners(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE);
    }

    socket.on('disconnect', reason => {
      removePostRegisterListeners();
      p2pServerManager.removeClient(clientId);
    });

    socket.on('reconnect', attemptNumber => {
      p2pServerManager.addClient(clientId, socket.id);
    });

    socket.on(SOCKET_EVENT.P2P_REGISTER, (targetClientId, p2pRegisterCallbackFn) => {
      let targetClientSocket = findTargetClientSocket(targetClientId);

      if (!targetClientSocket) {
        p2pRegisterCallbackFn(false);
        return;
      }

      targetClientSocket.once(SOCKET_EVENT.P2P_REGISTER_SUCCESS, () => {
        const sourceClientId = p2pServerManager.findClientIdBySocketId(socket.id);

        targetClientSocket.removeAllListeners(SOCKET_EVENT.P2P_REGISTER_FAILED);

        targetClientSocket.once('disconnect', () => {
          socket.emit(SOCKET_EVENT.P2P_DISCONNECT, targetClientId);
          removePostRegisterListeners();
        });

        socket.once('disconnect', () => {
          targetClientSocket.emit(SOCKET_EVENT.P2P_DISCONNECT, sourceClientId);
          removePostRegisterListeners();
        });

        socket.once(SOCKET_EVENT.P2P_UNREGISTER, () => {
          targetClientSocket = findTargetClientSocket(targetClientId);
          if (targetClientSocket) targetClientSocket.emit(SOCKET_EVENT.P2P_UNREGISTER);
          removePostRegisterListeners();
        });

        socket.on(SOCKET_EVENT.P2P_EMIT, ({event, args}) => {
          targetClientSocket = findTargetClientSocket(targetClientId);
          if (targetClientSocket) targetClientSocket.emit(event, ...args);
        });

        socket.on(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE, ({event, args}, acknowledgeFn) => {
          targetClientSocket = findTargetClientSocket(targetClientId);
          if (targetClientSocket) targetClientSocket.emit(event, ...args, acknowledgeFn);
        });

        // successful connection
        p2pRegisterCallbackFn(true);
      });

      targetClientSocket.once(SOCKET_EVENT.P2P_REGISTER_FAILED, () => {
        targetClientSocket.removeAllListeners(SOCKET_EVENT.P2P_REGISTER_SUCCESS);
        throwError(new Error(`Target client ${targetClientId} refuses the connection`));
        p2pRegisterCallbackFn(false);
      });

      targetClientSocket.emit(SOCKET_EVENT.P2P_REGISTER, clientId);
    });

    socket.on(SOCKET_EVENT.LIST_CLIENTS, (clientCallbackFn) => {
      clientCallbackFn(p2pServerManager.getAllClientId());
    });
  });

  return new Proxy(p2pServerManager, {
    get: (obj, prop) => {

      // if (prop === 'startServer')
      // if (prop === 'stopServer')

      if (prop === 'getClientSocketId') return p2pServerManager.getClientSocketId.bind(p2pServerManager);
      if (prop === 'getAllClientId') return p2pServerManager.getAllClientId.bind(p2pServerManager);
      if (prop === 'findClientIdBySocketId') return p2pServerManager.findClientIdBySocketId.bind(p2pServerManager);

      return obj[prop];
    }
  });
};
