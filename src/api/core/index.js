const {SOCKET_EVENT} = require('../../util/constants');

class P2pCoreApi {
  constructor(socket) {
    this.socket = socket;
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
}

module.exports = P2pCoreApi;
