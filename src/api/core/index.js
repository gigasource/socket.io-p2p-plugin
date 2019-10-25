const {SOCKET_EVENT} = require('../../util/constants');

class P2pCoreApi {
  constructor(socket) {
    this.socket = socket;
  }

  joinRoom(roomName) {
    this.socket.emit(SOCKET_EVENT.JOIN_ROOM, roomName);
  }

  emitRoom(roomName, event, ...args) {
    this.socket.emit(SOCKET_EVENT.EMIT_ROOM, roomName, event, ...args);
  }
}

module.exports = P2pCoreApi;
