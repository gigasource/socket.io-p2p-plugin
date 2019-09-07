const P2P_EMIT_EVENT = 'P2P_EMIT_EVENT';
const P2P_EMIT_ACKNOWLEDGE_EVENT = 'P2P_EMIT_ACKNOWLEDGE_EVENT';

class NewApi {
  constructor(io) {
    this.io = io;
  }

  registerP2pTarget(deviceId, opts = {}) {
    this.targetDeviceId = deviceId;
    this.opts = opts;
  }

  emit2() {
    // acknowledge case
    if (typeof arguments[arguments.length - 1] === 'function') {
      this.io.emit(P2P_EMIT_ACKNOWLEDGE_EVENT, ...arguments);
    }

    // no acknowledge case
    const [event, ...args] = arguments;
    this.io.emit(P2P_EMIT_EVENT, {
      deviceId: this.targetDeviceId,
      event,
      args,
    });
  }

  on2() {}
}


module.exports = function p2pClientPlugin(io) {
  const newApi = new NewApi(io);
  return new Proxy(io, {
    get: (obj, prop) => {

      if (prop === 'registerP2pTarget') return newApi.registerP2pTarget.bind(newApi);
      if (prop === 'unregisterP2p') return newApi.registerP2pTarget.bind(newApi);
      if (prop === 'emit2' || prop === 'emitP2p') return newApi.emit2.bind(newApi);
      if (prop === 'on2' || prop === 'onP2p') return newApi.on2.bind(newApi);

      return obj[prop];
    }
  });
}
