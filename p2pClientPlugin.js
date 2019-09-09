const {SOCKET_EVENT} = require('./util/constants');

class NewApi {
  constructor(io) {
    this.io = io;

    this.io.on(SOCKET_EVENT.P2P_REGISTER, (sourceDeviceId) => {
      if (!this.targetDeviceId) this.targetDeviceId = sourceDeviceId;
    });

    this.io.on(SOCKET_EVENT.P2P_DISCONNECT, () => {
      delete this.targetDeviceId;
    });
  }

  registerP2pTarget(targetDeviceId, options = {}) {
    this.targetDeviceId = targetDeviceId;
    this.options = options;

    this.io.emit(SOCKET_EVENT.P2P_REGISTER, targetDeviceId);
  }

  emit2() {
    const [event, ...args] = arguments;

    // acknowledge case
    if (typeof arguments[arguments.length - 1] === 'function') {
      const acknowledgeCallbackFn = args.pop(); // last arg is acknowledge callback function

      this.io.emit(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE, {
        targetDeviceId: this.targetDeviceId,
        event,
        args,
      }, acknowledgeCallbackFn);
    }
    // no acknowledge case
    else {
      this.io.emit(SOCKET_EVENT.P2P_EMIT, {
        targetDeviceId: this.targetDeviceId,
        event,
        args,
      });
    }
  }
}

module.exports = function p2pClientPlugin(io) {
  const newApi = new NewApi(io);
  return new Proxy(io, {
    get: (obj, prop) => {

      if (prop === 'registerP2pTarget') return newApi.registerP2pTarget.bind(newApi);
      if (prop === 'unregisterP2p') return newApi.registerP2pTarget.bind(newApi);
      if (prop === 'emit2' || prop === 'emitP2p') return newApi.emit2.bind(newApi);

      return obj[prop];
    }
  });
};
