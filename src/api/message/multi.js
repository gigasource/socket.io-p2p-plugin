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

  onAny(event, callback) {
    this.socket.on(event, (...args) => {
      args.shift();
      callback(...args);
    });
  }

  // socket.from('clientId').on('someEvent', () => {});
  from(targetClientId) {
    this.currentTargetId = targetClientId;
    return this;
  }

  on(event, callback) {
    const targetId = this.currentTargetId;
    this.socket.on(event, (...args) => {
      const targetClientId = args.shift();
      if (targetClientId === targetId) callback(...args);
    });

    this.listenerMap[targetId] = this.listenerMap[targetId] || [];
    this.listenerMap[targetId].push(event);
  }

  off(event, callback) {
    const targetId = this.currentTargetId;
    const eventName = `${event}${SOCKET_EVENT.CLIENT_IDENTIFIER_PREFIX}${targetId}`;

    if (callback) this.socket.off(eventName, callback);
    else this.socket.off(eventName);
  }

  // todo: add test
  once(event, callback) {
    const targetId = this.currentTargetId;
    const eventName = `${event}${SOCKET_EVENT.CLIENT_IDENTIFIER_PREFIX}${targetId}`; // format: event-from-client-abc123
    this.socket.once(eventName, callback);

    this.listenerMap[targetId] = this.listenerMap[targetId] || [];
    this.listenerMap[targetId].push(eventName);
  }

  emitTo(targetClientId, event, ...args) {
    args.unshift(this.clientId);
    // acknowledge case
    if (typeof args[args.length - 1] === 'function') {
      const acknowledgeCallbackFn = args.pop(); // last arg is acknowledge callback function

      this.socket.emit(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE, {
        targetClientId,
        event,
        args,
      }, acknowledgeCallbackFn);
    }
    // no acknowledge case
    else {
      this.socket.emit(SOCKET_EVENT.P2P_EMIT, {
        targetClientId,
        event,
        args,
      });
    }
  }
}

module.exports = P2pMultiMessageApi;
