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

    const emitError = (err) => {
      console.error(`From client with id '${p2pServerManager.findClientIdBySocketId(socket.id)}': ${err}`);
      socket.emit(SOCKET_EVENT.SERVER_ERROR, err.toString());
    }
    const findTargetClientSocket = (targetClientId) => {
      const targetClientSocket = io.sockets.connected[p2pServerManager.getClientSocketId(targetClientId)];
      if (!targetClientSocket) emitError(new Error(`Could not find target client '${targetClientId}' socket`));
      return targetClientSocket;
    }

    socket.on('disconnect', reason => {
      p2pServerManager.removeClient(clientId);
    });
    socket.on('reconnect', attemptNumber => {
      p2pServerManager.addClient(clientId, socket.id);
    });
    socket.on(SOCKET_EVENT.P2P_EMIT, ({targetClientId, event, args}) => {
      if (!targetClientId) emitError(new Error('targetClientId is not set'));
      const targetClientSocket = findTargetClientSocket(targetClientId);
      if (targetClientSocket) targetClientSocket.emit(event, ...args);
    });
    socket.on(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE, ({targetClientId, event, args}, acknowledgeFn) => {
      if (!targetClientId) emitError(new Error('targetClientId is not set'));
      const targetClientSocket = findTargetClientSocket(targetClientId);
      if (targetClientSocket) targetClientSocket.emit(event, ...args, acknowledgeFn);
    });
    socket.on(SOCKET_EVENT.P2P_REGISTER, (targetClientId, p2pRegisterCallbackFn) => {
      let targetClientSocket = findTargetClientSocket(targetClientId);

      if (!targetClientSocket) {
        emitError(new Error('Target client is not registered to the server'));
        p2pRegisterCallbackFn(false);
        return;
      }

      targetClientSocket.emit(SOCKET_EVENT.P2P_REGISTER, clientId, registerSuccess => {
        if (registerSuccess) {
          const disconnectListener = () => {
            targetClientSocket = findTargetClientSocket(targetClientId);
            if (targetClientSocket) targetClientSocket.emit(SOCKET_EVENT.P2P_DISCONNECT);
            if (socket) socket.emit(SOCKET_EVENT.P2P_DISCONNECT);

            removePostRegisterListeners(targetClientSocket);
            removePostRegisterListeners(socket);
          };
          const unregisterListener = callback => {
            targetClientSocket = findTargetClientSocket(targetClientId);
            if (targetClientSocket) targetClientSocket.emit(SOCKET_EVENT.P2P_UNREGISTER, callback);
            if (socket) socket.emit(SOCKET_EVENT.P2P_UNREGISTER, callback);

            removePostRegisterListeners(targetClientSocket);
            removePostRegisterListeners(socket);
          };
          const registerStreamListener = (targetClientId, callback) => {
            const sk = findTargetClientSocket(targetClientId);
            if (sk) sk.emit(SOCKET_EVENT.P2P_REGISTER_STREAM, callback);
          }

          const addPostRegisterListeners = (sk) => {
            removePostRegisterListeners(sk);
            sk.once('disconnect', disconnectListener);
            sk.once(SOCKET_EVENT.P2P_UNREGISTER, unregisterListener);
            sk.on(SOCKET_EVENT.P2P_REGISTER_STREAM, registerStreamListener);
          }
          const removePostRegisterListeners = (sk) => {
            if (sk) {
              sk.removeAllListeners(SOCKET_EVENT.P2P_UNREGISTER);
              sk.removeAllListeners(SOCKET_EVENT.P2P_REGISTER_STREAM);
              sk.off('disconnect', disconnectListener);
            }
          }

          addPostRegisterListeners(socket);
          addPostRegisterListeners(targetClientSocket);
        } else {
          emitError(new Error(`Target client ${targetClientId} refuses the connection`));
        }
        p2pRegisterCallbackFn(registerSuccess);
      });
    });
    socket.on(SOCKET_EVENT.LIST_CLIENTS, clientCallbackFn => clientCallbackFn(p2pServerManager.getAllClientId()));
  });

  return new Proxy(io, {
    get: (obj, prop) => {

      if (prop === 'getClientSocketId') return p2pServerManager.getClientSocketId.bind(p2pServerManager);
      if (prop === 'getAllClientId') return p2pServerManager.getAllClientId.bind(p2pServerManager);
      if (prop === 'findClientIdBySocketId') return p2pServerManager.findClientIdBySocketId.bind(p2pServerManager);

      return obj[prop];
    }
  });
};
