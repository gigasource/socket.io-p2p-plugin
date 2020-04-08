const {SOCKET_EVENT} = require('../../util/constants');

class P2pClientMessageApi {
  constructor(socket, clientId) {
    this.socket = socket;
    this.clientId = clientId;
  }

  addP2pTarget(targetClientId, callback) {
    if (callback) {
      this.socket.emit(SOCKET_EVENT.ADD_TARGET, targetClientId, callback);
    } else {
      return new Promise(resolve => {
        this.socket.emit(SOCKET_EVENT.ADD_TARGET, targetClientId, resolve);
      });
    }
  }

  // Currently there is no mechanism to filter target -> allow all clients to add target
  onAddP2pTarget(callback) {
    if (!callback || typeof callback !== 'function') throw new Error('onAddP2pTarget requires a Function as parameter')

    this.socket.on(SOCKET_EVENT.ADD_TARGET, (targetClientId, peerCallback) => {
      peerCallback();
      callback(targetClientId);
    });
  }

  emitTo(targetClientId, event, ...args) {
    let ack;
    if (typeof args[args.length - 1] === 'function') ack = args.pop();

    if (ack) this.socket.emit(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE, {targetClientId, event, args}, ack);
    else this.socket.emit(SOCKET_EVENT.P2P_EMIT, {targetClientId, event, args});
  }

  on(...args) {
    this.socket.on(...args);
  }
}

module.exports = P2pClientMessageApi;
