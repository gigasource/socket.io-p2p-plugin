const {SOCKET_EVENT} = require('../../util/constants');
const reject = require('lodash/reject');

class P2pClientMessageApi {
  constructor(socket, clientId) {
    this.socket = socket;
    this.clientId = clientId;
    this.listenerMap = {}; // used for listeners created with from().on(), from().once();
    this.listenerMapAny = {}; // used for listeners create with onAny(), onceAny();

    this.socket.on(SOCKET_EVENT.MULTI_API_TARGET_DISCONNECT, (targetClientId) => {
      if (this.listenerMap[targetClientId]) {
        this.listenerMap[targetClientId].forEach(({event, listener}) => this.socket.off(event, listener));
        delete this.listenerMap[targetClientId];
      }
    });

    this.socket.on(SOCKET_EVENT.SERVER_ERROR, (err) => console.error(err));
  }

  addP2pTarget(targetClientId, callback) {
    if (callback) {
      this.socket.emit(SOCKET_EVENT.MULTI_API_ADD_TARGET, targetClientId, callback);
    } else {
      return new Promise((resolve) => {
        this.socket.emit(SOCKET_EVENT.MULTI_API_ADD_TARGET, targetClientId, resolve);
      });
    }
  }

  // Currently there is no mechanism to filter target -> allow all clients to add target
  onAddP2pTarget(callback) {
    this.socket.on(SOCKET_EVENT.MULTI_API_ADD_TARGET, (targetClientId, clientCallback) => {
      clientCallback();
      callback(targetClientId)
    });
  }

  onAny(event, callback) {
    const newCallback = (...args) => {
      args.shift();
      callback(...args);
    };

    this.listenerMapAny[event] = this.listenerMapAny[event] || [];
    this.listenerMapAny[event].push({callback, newCallback});
    this.socket.on(event, newCallback);
  }

  onceAny(event, callback) {
    const newCallback = (...args) => {
      args.shift();
      callback(...args);
    };

    this.listenerMapAny[event] = this.listenerMapAny[event] || [];
    this.listenerMapAny[event].push({callback, newCallback});
    this.socket.once(event, newCallback);
  }

  offAny(event, callback) {
    if (!event && !callback) {
      Object.keys(this.listenerMapAny).forEach(event => this.socket.off(event));
      this.listenerMapAny = {};
    } else {
      const listeners = this.listenerMapAny[event];
      if (!listeners) return;

      if (callback) {
        listeners.forEach(({callback: cb, newCallback}) => {
          if (cb === callback) this.socket.off(event, newCallback);
        });
        this.listenerMap[event] = reject(listeners, {callback});
      } else {
        this.socket.off(event);
        delete this.listenerMap[event];
      }
    }
  }

  // socket.from('clientId').on('someEvent', () => {});
  from(targetClientId) {
    this.currentTargetId = targetClientId;
    return this;
  }

  on(event, callback) {
    const targetId = this.currentTargetId;
    const newCallback = (...args) => {
      const targetClientId = args.shift();
      if (targetClientId === targetId) callback(...args);
    };
    this.socket.on(event, newCallback);

    this.listenerMap[targetId] = this.listenerMap[targetId] || [];
    this.listenerMap[targetId].push({event, callback, newCallback});
  }

  off(event, callback) {
    let targetListeners = this.listenerMap[this.currentTargetId];
    if (!targetListeners) return;

    if (callback) {
      targetListeners.forEach(({event: ev, callback: cb, newCallback}) => {
        if (ev === event && cb === callback) this.socket.off(event, newCallback);
      });
      this.listenerMap[this.currentTargetId] = reject(targetListeners, {event, callback});
    } else {
      targetListeners.forEach(({event: ev, newCallback}) => {
        if (ev === event) this.socket.off(event, newCallback);
      });
      this.listenerMap[this.currentTargetId] = reject(targetListeners, {event});
    }
  }

  once(event, callback) {
    const targetId = this.currentTargetId;
    const newCallback = (...args) => {
      const targetClientId = args.shift();
      if (targetClientId === targetId) {
        this.listenerMap[this.currentTargetId] = reject(this.listenerMap[this.currentTargetId],
          {event: event, callback: callback});
        callback(...args);
      }
    };

    this.socket.once(event, newCallback);

    this.listenerMap[targetId] = this.listenerMap[targetId] || [];
    this.listenerMap[targetId].push({event, callback, newCallback});
  }

  emitTo(targetClientId, event, ...args) {
    let ack;
    if (typeof args[args.length - 1] === 'function') ack = args.pop();

    args.unshift(this.clientId);
    if (ack) this.socket.emit(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE, {targetClientId, event, args}, ack);
    else this.socket.emit(SOCKET_EVENT.P2P_EMIT, {targetClientId, event, args});
  }
}

module.exports = P2pClientMessageApi;
