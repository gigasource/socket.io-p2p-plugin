const {SOCKET_EVENT} = require('./util/constants');

class NewApi {
  constructor(io) {
    this.io = io;

    this.io.on(SOCKET_EVENT.P2P_REGISTER, (sourceClientId) => {
      if (!this.targetClientId) {
        this.targetClientId = sourceClientId;
        this.io.emit(SOCKET_EVENT.P2P_REGISTER_SUCCESS);
      } else {
        this.io.emit(SOCKET_EVENT.P2P_REGISTER_FAILED);
      }
    });

    this.io.on(SOCKET_EVENT.P2P_DISCONNECT, () => {
      delete this.targetClientId;
    });
  }

  unregisterP2pTarget() {
    if (this.targetClientId) {
      this.io.emit('disconnect');
      delete this.targetClientId;
    }
  }

  /**
   * @param targetClientId Id of the client you want to connect to
   * @param options Not yet used
   * @param successCallbackFn Callback function to be called if the connection is established successfully, otherwise throw an error
   */
  registerP2pTarget(targetClientId, options = {}, successCallbackFn) {
    this.io.emit(SOCKET_EVENT.P2P_REGISTER, targetClientId, (targetAvailable) => {
      if (targetAvailable) {
        this.targetClientId = targetClientId;
        this.options = options;
        successCallbackFn();
      } else {
        throw new Error('Target client is not available for connection');
      }
    });
  }

  emit2() {
    const [event, ...args] = arguments;

    // acknowledge case
    if (typeof arguments[arguments.length - 1] === 'function') {
      const acknowledgeCallbackFn = args.pop(); // last arg is acknowledge callback function

      this.io.emit(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE, {
        targetClientId: this.targetClientId,
        event,
        args,
      }, acknowledgeCallbackFn);
    }
    // no acknowledge case
    else {
      this.io.emit(SOCKET_EVENT.P2P_EMIT, {
        targetClientId: this.targetClientId,
        event,
        args,
      });
    }
  }

  getClientList(callbackFn) {
    this.io.emit(SOCKET_EVENT.LIST_CLIENTS, (clientList) => {
      callbackFn(clientList);
    });
  }
}

module.exports = function p2pClientPlugin(io) {
  const newApi = new NewApi(io);
  return new Proxy(io, {
    get: (obj, prop) => {

      if (prop === 'registerP2pTarget') return newApi.registerP2pTarget.bind(newApi);
      if (prop === 'unregisterP2pTarget') return newApi.unregisterP2pTarget().bind(newApi);
      if (prop === 'emit2' || prop === 'emitP2p') return newApi.emit2.bind(newApi);
      if (prop === 'getClientList') return newApi.getClientList.bind(newApi);
      if (prop === 'createDeviceListListener') return newApi.createDeviceListListener.bind(newApi);

      return obj[prop];
    }
  });
};
