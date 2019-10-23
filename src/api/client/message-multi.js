const {SOCKET_EVENT} = require('../../util/constants');

class P2pMultiMessageApi {
  constructor(socket, clientId) {
    this.socket = socket;
    this.clientId = clientId;
    this.listenerMap = {};

    this.socket.on(SOCKET_EVENT.MULTI_API_TARGET_DISCONNECT, targetClientId => {
      if (this.listenerMap[targetClientId]) {
        this.listenerMap[targetClientId].forEach(eventName => this.socket.removeAllListeners(eventName));
        delete this.listenerMap[targetClientId];
      }
    });
  }

  addP2pTarget(targetClientId, successCallback, failureCallback) {
    if (successCallback || failureCallback) {
      this.socket.emit(SOCKET_EVENT.MULTI_API_ADD_TARGET, targetClientId, success => {
        if (success && successCallback) successCallback();
        else if (!success && failureCallback) failureCallback();
      });
    } else {
      return new Promise(resolve => {
        this.socket.emit(SOCKET_EVENT.MULTI_API_ADD_TARGET, targetClientId, success => resolve(success));
      });
    }
  }

  onAddP2pTarget(callback) {
    this.socket.on(SOCKET_EVENT.MULTI_API_ADD_TARGET, (targetClientId, clientCallback) => {
      clientCallback(true);
      callback(targetClientId)
    });
  }

  // socket.from('clientId').on('someEvent', () => {});
  from(targetClientId) {
    this.currentTargetId = targetClientId;
    return this;
  }

  on(event, callback) {
    const targetId = this.currentTargetId
    const eventName = `${event}-from-${targetId}`;
    this.socket.on(eventName, callback);

    this.listenerMap[targetId] = this.listenerMap[targetId] || [];
    this.listenerMap[targetId].push(eventName);
  }

  off(event, callback) {
    const eventName = `${event}-from-${this.currentTargetId}`;

    if (callback) this.socket.off(eventName, callback);
    else this.socket.off(eventName);
  }

  emitTo(targetClientId, event, ...args) {
    // acknowledge case
    if (typeof args[args.length - 1] === 'function') {
      const acknowledgeCallbackFn = args.pop(); // last arg is acknowledge callback function

      this.socket.emit(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE, {
        targetClientId,
        event: `${event}-from-${this.clientId}`,
        args,
      }, acknowledgeCallbackFn);
    }
    // no acknowledge case
    else {
      this.socket.emit(SOCKET_EVENT.P2P_EMIT, {
        targetClientId,
        event: `${event}-from-${this.clientId}`,
        args,
      });
    }
  }
}

module.exports = P2pMultiMessageApi;
