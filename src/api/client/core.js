const {SOCKET_EVENT} = require('../../util/constants');

class P2pClientCoreApi {
  constructor(socket, clientId) {
    this.socket = socket;
    this.clientId = clientId;

    this.socket.on(SOCKET_EVENT.SERVER_ERROR, (err) => console.error(`Error sent from server to client '${this.clientId}': ${err}`));
  }

  joinRoom(...args) {
    this.socket.emit(SOCKET_EVENT.JOIN_ROOM, ...args);
  }

  leaveRoom(...args) {
    this.socket.emit(SOCKET_EVENT.LEAVE_ROOM, ...args);
  }

  emitRoom(...args) {
    this.socket.emit(SOCKET_EVENT.EMIT_ROOM, ...args);
  }

  // todo: add timeout + test
  getClientList(callback) {
    if (callback) {
      this.socket.emit(SOCKET_EVENT.LIST_CLIENTS, callback);
    } else {
      return new Promise(resolve => this.socket.emit(SOCKET_EVENT.LIST_CLIENTS, resolve));
    }
  }
}

module.exports = P2pClientCoreApi;
