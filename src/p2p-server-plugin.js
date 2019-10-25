const {SOCKET_EVENT, SOCKET_EVENT_ACTION} = require('./util/constants');
const findKey = require('lodash/findKey');

class P2pServerManager {
  constructor(io) {
    this.clientMap = {};
    this.serviceMap = {};
    this.io = io;
  }

  addService(serviceName, clientId, clientSocketId) {
    if (serviceName && clientId) {
      this.serviceMap[serviceName] = this.serviceMap[serviceName] || [];
      this.serviceMap[serviceName].push(clientId);
      this.addClient(clientId, clientSocketId);
    }
  }

  getClientIdByServiceName(serviceName) {
    // todo: handle multiple clients for 1 service
    return (this.serviceMap[serviceName] && this.serviceMap[serviceName].length > 0) ? this.serviceMap[serviceName][0] : null;
  }

  getSocketByServiceName(serviceName) {
    const clientId = this.getClientIdByServiceName(serviceName);

    if (!clientId) {
      // todo: show error
      return null;
    }

    const socket = this.getSocketByClientId(clientId);
    // if (!socket) {} todo: show error
    return socket;
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

  getClientIdBySocketId(socketId) {
    return findKey(this.clientMap, (v) => v === socketId);
  }

  getSocketByClientId(targetClientId) {
    return this.io.sockets.connected[this.getClientSocketId(targetClientId)];
  }

  // Socket-related functions
  emitError(socket, err) {
    console.error(`Error from client '${this.getClientIdBySocketId(socket.id)}': ${err}`);
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
      const targetClientSocket = socket.getSocketByClientId(targetClientId);
      if (targetClientSocket) targetClientSocket.emit(event, ...args);
    });
    socket.on(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE, ({targetClientId, event, args}, acknowledgeFn) => {
      const targetClientSocket = socket.getSocketByClientId(targetClientId);
      if (targetClientSocket) targetClientSocket.emit(event, ...args, acknowledgeFn);
    });
    socket.on(SOCKET_EVENT.JOIN_ROOM, (action, ...args) => {
      //todo: filter mechanism to deny access to room
      let clientId, roomName, callback;
      if (action === SOCKET_EVENT_ACTION.PUBLISH_SERVICE) {
        [roomName, callback] = args;
        socket.join(roomName);
      } else if (action === SOCKET_EVENT_ACTION.SUBSCRIBE_CLIENT) {
        [clientId, roomName, callback] = args;
        const sk = this.getSocketByClientId(clientId);

        if (!sk) {
          if (callback) callback(false);
          return;
        }

        sk.join(roomName);
      }

      if (callback) callback(true);
    });
    socket.on(SOCKET_EVENT.EMIT_ROOM, (roomName, event, ...args) => {
      //todo: filter mechanism to deny access to room
      socket.to(roomName).emit(event, ...args);
    });
  }

  initSingleApiListeners(socket, clientId) {
    socket.on(SOCKET_EVENT.P2P_REGISTER, (targetClientId, p2pRegisterCallbackFn) => {
      let targetClientSocket = socket.getSocketByClientId(targetClientId);

      if (!targetClientSocket) {
        p2pRegisterCallbackFn(false);
        return;
      }

      targetClientSocket.emit(SOCKET_EVENT.P2P_REGISTER, clientId, registerSuccess => {
        if (registerSuccess) {
          const disconnectListener = () => {
            targetClientSocket = socket.getSocketByClientId(targetClientId);

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
            targetClientSocket = socket.getSocketByClientId(targetClientId);

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
            const sk = socket.getSocketByClientId(targetClientId);
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
      const targetClientSocket = socket.getSocketByClientId(targetClientId);
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

      const targetClientSocket = socket.getSocketByClientId(targetClientId);
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

  initServiceApiListener(socket) {
    socket.on(SOCKET_EVENT.P2P_EMIT_SERVICE, ({serviceName, event, args}) => {
      const serviceSocket = this.getSocketByServiceName(serviceName);
      if (serviceSocket) serviceSocket.emit(event, ...args);
    });

    socket.on(SOCKET_EVENT.P2P_EMIT_SERVICE_ACKNOWLEDGE, ({serviceName, event, args}, acknowledgeFn) => {
      const serviceSocket = this.getSocketByServiceName(serviceName);
      if (serviceSocket) serviceSocket.emit(event, ...args, acknowledgeFn);
    });
  }

  initSocketBasedApis(socket) {
    socket.on(SOCKET_EVENT.LIST_CLIENTS, clientCallbackFn => clientCallbackFn(this.getAllClientId()));
  }
}

module.exports = function p2pServerPlugin(io) {
  const p2pServerManager = new P2pServerManager(io);
  io.on('test', () => console.log('test server'));
  io.on('connect', (socket) => {
    const {clientId, serviceName} = socket.request._query;

    socket.getSocketByClientId = targetClientId => {
      const targetClientSocket = p2pServerManager.getSocketByClientId(targetClientId);
      if (!targetClientSocket) p2pServerManager.emitError(socket, new Error(`Could not find target client '${targetClientId}' socket`));
      return targetClientSocket;
    }

    if (serviceName) p2pServerManager.addService(serviceName, clientId, socket.id);
    else p2pServerManager.addClient(clientId, socket.id);

    p2pServerManager.initCoreListeners(socket, clientId);
    p2pServerManager.initSingleApiListeners(socket, clientId);
    p2pServerManager.initMultiMessageApiListeners(socket, clientId);
    p2pServerManager.initMultiStreamApiListeners(socket, clientId);
    p2pServerManager.initServiceApiListener(socket);
    p2pServerManager.initSocketBasedApis(socket);
  });

  return new Proxy(io, {
    get: (obj, prop) => {

      if (prop === 'getClientSocketId') return p2pServerManager.getClientSocketId.bind(p2pServerManager);
      if (prop === 'getAllClientId') return p2pServerManager.getAllClientId.bind(p2pServerManager);
      if (prop === 'getClientIdBySocketId') return p2pServerManager.getClientIdBySocketId.bind(p2pServerManager);

      return obj[prop];
    }
  });
};
