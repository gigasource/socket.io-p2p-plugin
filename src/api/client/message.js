const {SOCKET_EVENT: {ADD_TARGET, TARGET_DISCONNECT, P2P_EMIT}} = require('../../util/constants');

class P2pClientMessageApi {
  constructor(socket, clientId) {
    this.socket = socket;
    this.clientId = clientId;
  }

  addP2pTarget(targetClientId, callback) {
    if (callback) {
      this.socket.emit(ADD_TARGET, targetClientId, callback);
    } else {
      return new Promise((resolve, reject) => {
        this.socket.emit(ADD_TARGET, targetClientId, err => {
          err ? reject(`Target client ${targetClientId} is not connected to server`) : resolve()
        });
      });
    }
  }

  // Currently there is no mechanism to filter target, allowing all clients to add target
  onAddP2pTarget(callback) {
    if (!callback || typeof callback !== 'function') throw new Error('onAddP2pTarget requires a Function as parameter')

    this.socket.on(ADD_TARGET, (targetClientId, peerCallback) => {
      peerCallback();
      callback(targetClientId);
    });
  }

  onP2pTargetDisconnect(callback) {
    if (!callback || typeof callback !== 'function') throw new Error('onP2pTargetDisconnect requires a Function as parameter')

    this.socket.on(TARGET_DISCONNECT, callback);
  }

  emitTo(targetClientId, event, ...args) {
    let ack;
    if (typeof args[args.length - 1] === 'function') ack = args.pop();

    this.socket.emit(P2P_EMIT, targetClientId, event, args, ack);
  }
}

module.exports = P2pClientMessageApi;
