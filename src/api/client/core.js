const {SOCKET_EVENT} = require('../../util/constants');
const flatten = require('lodash/flatten');

class P2pClientCoreApi {
  constructor(socket, clientId) {
    this.socket = socket;
    this.clientId = clientId;

    this.socket.on(SOCKET_EVENT.SERVER_ERROR, (err) => console.error(`Error sent from server to client '${this.clientId}': ${err}`));
    this.socket.on(SOCKET_EVENT.SERVER_PING, callback => callback(`pong from client ${clientId}`));
  }

  /* Note: currently room functions do not have any security feature,
     Clients outside the room can emit to the room */
  joinRoom(roomName, callback) {
    this.socket.emit(SOCKET_EVENT.JOIN_ROOM, roomName, callback);
  }

  leaveRoom(roomName, callback) {
    this.socket.emit(SOCKET_EVENT.LEAVE_ROOM, roomName, callback);
  }

  emitRoom(roomName, event, ...args) {
    this.socket.emit(SOCKET_EVENT.EMIT_ROOM, roomName, event, ...args);
  }

  getClientList(successCallbackFn) {
    if (successCallbackFn) {
      this.socket.emit(SOCKET_EVENT.LIST_CLIENTS, (clientList) => {
        successCallbackFn(clientList);
      });
    } else {
      return new Promise(resolve => {
        this.socket.emit(SOCKET_EVENT.LIST_CLIENTS, (clientList) => {
          resolve(clientList);
        });
      });
    }
  }

  isClientConnected(clientId, successCallbackFn) {
    if (successCallbackFn) {
      this.socket.emit(SOCKET_EVENT.GET_CLIENT_CONNECTED_STATUS, clientId, (connectedStatus) => {
        successCallbackFn(connectedStatus)
      })
    } else {
      return new Promise(resolve => {
        this.socket.emit(SOCKET_EVENT.GET_CLIENT_CONNECTED_STATUS, clientId, (connectedStatus) => {
          resolve(connectedStatus)
        })
      })
    }
  }
}

module.exports = P2pClientCoreApi;
