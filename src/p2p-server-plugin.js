const {SOCKET_EVENT} = require('./util/constants');
const findKey = require('lodash/findKey');

class P2pServerManager {
  constructor(io) {
    this.clientMap = {};
    this.io = io;
  }

  // Client-related functions
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

  findSocketByClientId(targetClientId) {
    return this.io.sockets.connected[this.getClientSocketId(targetClientId)];
  }

  // Socket-related functions
  emitError(socket, err) {
    console.error(`Error from client '${this.findClientIdBySocketId(socket.id)}': ${err}`);
    socket.emit(SOCKET_EVENT.SERVER_ERROR, err.toString());
  }

  initCoreListeners(socket, clientId) {
    socket.on('disconnect', () => {
      this.removeClient(clientId);
    });

    socket.on('reconnect', () => {
      this.addClient(clientId, socket.id);
    });

    socket.on(SOCKET_EVENT.P2P_EMIT, ({targetClientId, event, args}) => {
      const targetClientSocket = socket.findSocketByClientId(targetClientId);
      if (targetClientSocket) targetClientSocket.emit(event, ...args);
    });

    socket.on(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE, ({targetClientId, event, args}, acknowledgeFn) => {
      const targetClientSocket = socket.findSocketByClientId(targetClientId);
      if (targetClientSocket) targetClientSocket.emit(event, ...args, acknowledgeFn);
    });
  }

  initSingleApiListeners(socket, clientId) {
    socket.on(SOCKET_EVENT.P2P_REGISTER, (targetClientId, p2pRegisterCallbackFn) => {
      let targetClientSocket = socket.findSocketByClientId(targetClientId);

      if (!targetClientSocket) {
        p2pRegisterCallbackFn(false);
        return;
      }

      targetClientSocket.emit(SOCKET_EVENT.P2P_REGISTER, clientId, registerSuccess => {
        if (registerSuccess) {
          const disconnectListener = () => {
            targetClientSocket = socket.findSocketByClientId(targetClientId);

            if (targetClientSocket) {
              targetClientSocket.emit(SOCKET_EVENT.P2P_DISCONNECT);
              removePostRegisterListeners(targetClientSocket);
            }

            if (socket) {
              removePostRegisterListeners(socket);
              socket.emit(SOCKET_EVENT.P2P_DISCONNECT);
            }
          };
          const unregisterListener = callback => {
            targetClientSocket = socket.findSocketByClientId(targetClientId);

            if (targetClientSocket) {
              targetClientSocket.emit(SOCKET_EVENT.P2P_UNREGISTER, callback);
              removePostRegisterListeners(targetClientSocket);
            }

            if (socket) {
              socket.emit(SOCKET_EVENT.P2P_UNREGISTER, callback);
              removePostRegisterListeners(socket);
            }
          };
          const registerStreamListener = (targetClientId, callback) => {
            const sk = socket.findSocketByClientId(targetClientId);
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
          this.emitError(socket, new Error(`Target client ${targetClientId} refuses the connection`));
        }
        p2pRegisterCallbackFn(registerSuccess);
      });
    });
  }

  initMultiMessageApiListeners(socket, clientId) {
    socket.on(SOCKET_EVENT.MULTI_API_ADD_TARGET, (targetClientId, callback) => {
      const targetClientSocket = socket.findSocketByClientId(targetClientId);
      if (!targetClientSocket) {
        callback(false);
        return;
      }

      const disconnectListener = (sk, clientId) => {
        if (sk) sk.emit(SOCKET_EVENT.MULTI_API_TARGET_DISCONNECT, clientId);
      }
      const sourceDisconnectListener = disconnectListener.bind(null, targetClientSocket, clientId); // If source disconnects -> notify target
      const targetDisconnectListener = disconnectListener.bind(null, socket, targetClientId); // If target disconnects -> notify source

      socket.once('disconnect', () => {
        sourceDisconnectListener();

        if (!targetClientSocket) {
          this.emitError(socket, new Error(`Could not find target client '${targetClientId}' socket`));
          return;
        }

        targetClientSocket.off('disconnect', targetDisconnectListener);
      });
      targetClientSocket.once('disconnect', () => {
        targetDisconnectListener();
        if (socket) socket.off('disconnect', sourceDisconnectListener);
      });

      targetClientSocket.emit(SOCKET_EVENT.MULTI_API_ADD_TARGET, clientId, callback);
    });
  }

  initMultiStreamApiListeners(socket, clientId) {
    socket.on(SOCKET_EVENT.MULTI_API_CREATE_STREAM, (connectionInfo, callback) => {
      const {targetClientId} = connectionInfo;
      connectionInfo.sourceClientId = clientId;

      const targetClientSocket = socket.findSocketByClientId(targetClientId);
      if (!targetClientSocket) {
        callback(false);
        return;
      }

      const disconnectListener = (sk, clientId) => {
        if (sk) sk.emit(SOCKET_EVENT.MULTI_API_TARGET_DISCONNECT, clientId);
      }
      const sourceDisconnectListener = disconnectListener.bind(null, targetClientSocket, clientId); // If source disconnects -> notify target
      const targetDisconnectListener = disconnectListener.bind(null, socket, targetClientId); // If target disconnects -> notify source

      socket.once('disconnect', () => {
        sourceDisconnectListener();

        if (!targetClientSocket) {
          this.emitError(socket, new Error(`Could not find target client '${targetClientId}' socket`));
          return;
        }

        targetClientSocket.off('disconnect', targetDisconnectListener);
      });
      targetClientSocket.once('disconnect', () => {
        targetDisconnectListener();
        if (socket) socket.off('disconnect', sourceDisconnectListener);
      });

      targetClientSocket.emit(SOCKET_EVENT.MULTI_API_CREATE_STREAM, connectionInfo, callback);
    });
  }

  initSocketBasedApis(socket) {
    socket.on(SOCKET_EVENT.LIST_CLIENTS, clientCallbackFn => clientCallbackFn(this.getAllClientId()));
  }
}

module.exports = function p2pServerPlugin(io) {
  const p2pServerManager = new P2pServerManager(io);

  io.on('connect', (socket) => {
    const {clientId} = socket.request._query;

    socket.findSocketByClientId = targetClientId => {
      const targetClientSocket = p2pServerManager.findSocketByClientId(targetClientId);
      if (!targetClientSocket) p2pServerManager.emitError(socket, new Error(`Could not find target client '${targetClientId}' socket`));
      return targetClientSocket;
    }

    p2pServerManager.addClient(clientId, socket.id);

    p2pServerManager.initCoreListeners(socket, clientId);
    p2pServerManager.initSingleApiListeners(socket, clientId);
    p2pServerManager.initMultiMessageApiListeners(socket, clientId);
    p2pServerManager.initMultiStreamApiListeners(socket, clientId);
    p2pServerManager.initSocketBasedApis(socket);
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
