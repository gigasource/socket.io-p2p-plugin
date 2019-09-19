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
      console.error(`From client with id ${p2pServerManager.findClientIdBySocketId(socket.id)}:`);
      console.error(err);
      socket.emit(SOCKET_EVENT.SERVER_ERROR, err.toString());
    }

    const findTargetClientSocket = (targetClientId) => {
      const targetClientSocket = io.sockets.connected[p2pServerManager.getClientSocketId(targetClientId)];
      if (!targetClientSocket)
        throwError(new Error(`Could not find target client ${targetClientId} socket, client is not registered to the server`));
      return targetClientSocket;
    }

    socket.on('disconnect', reason => {
      p2pServerManager.removeClient(clientId);
    });

    socket.on('reconnect', attemptNumber => {
      p2pServerManager.addClient(clientId, socket.id);
    });

    socket.on(SOCKET_EVENT.P2P_EMIT, ({targetClientId, event, args}) => {
      if (!targetClientId) throwError(new Error('targetClientId is not set'));
      const targetClientSocket = findTargetClientSocket(targetClientId);
      if (targetClientSocket) targetClientSocket.emit(event, ...args);
    });

    socket.on(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE, ({targetClientId, event, args}, acknowledgeFn) => {
      if (!targetClientId) throwError(new Error('targetClientId is not set'));
      const targetClientSocket = findTargetClientSocket(targetClientId);
      if (targetClientSocket) targetClientSocket.emit(event, ...args, acknowledgeFn);
    });

    socket.on(SOCKET_EVENT.P2P_REGISTER, (targetClientId, p2pRegisterCallbackFn) => {
      let targetClientSocket = findTargetClientSocket(targetClientId);

      if (!targetClientSocket) {
        throwError(new Error('Target client is not registered to the server'));
        p2pRegisterCallbackFn(false);
        return;
      }

      targetClientSocket.once(SOCKET_EVENT.P2P_REGISTER_SUCCESS, () => {
        targetClientSocket.removeAllListeners(SOCKET_EVENT.P2P_REGISTER_FAILED);

        const disconnectListener = () => {
          targetClientSocket = findTargetClientSocket(targetClientId);
          if (targetClientSocket) targetClientSocket.emit(SOCKET_EVENT.P2P_DISCONNECT);
          if (socket) socket.emit(SOCKET_EVENT.P2P_DISCONNECT);
          removePostRegisterListeners();
        };

        const unregisterListener = (doneCallback) => {
          targetClientSocket = findTargetClientSocket(targetClientId);
          if (targetClientSocket) targetClientSocket.emit(SOCKET_EVENT.P2P_UNREGISTER, doneCallback);
          if (socket) socket.emit(SOCKET_EVENT.P2P_UNREGISTER, doneCallback);
          removePostRegisterListeners();
        };

        const removePostRegisterListeners = () => {
          targetClientSocket = findTargetClientSocket(targetClientId);

          if (socket) {
            socket.off(SOCKET_EVENT.P2P_UNREGISTER, unregisterListener);
            socket.off('disconnect', disconnectListener);
          }

          if (targetClientSocket) {
            targetClientSocket.off(SOCKET_EVENT.P2P_UNREGISTER, unregisterListener);
            targetClientSocket.off('disconnect', disconnectListener);
          }
        }

        targetClientSocket.once('disconnect', disconnectListener);
        targetClientSocket.once(SOCKET_EVENT.P2P_UNREGISTER, unregisterListener);
        socket.once('disconnect', disconnectListener);
        socket.once(SOCKET_EVENT.P2P_UNREGISTER, unregisterListener);

        // successful connection
        p2pRegisterCallbackFn(true);
        // Notify the clients that connection has been established
        socket.emit(SOCKET_EVENT.P2P_REGISTER_SUCCESS);
        targetClientSocket.emit(SOCKET_EVENT.P2P_REGISTER_SUCCESS);
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

  return new Proxy(io, {
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
