const {SOCKET_EVENT} = require('../../util/constants');

class P2pServerServiceApi {
  constructor(coreApi) {
    this.coreApi = coreApi;
    this.serviceApis = new Map();
  }

  createListeners(io, socket) {
    socket.on(SOCKET_EVENT.CHECK_API_NAME, (apiName, callback) => {
      callback(this.serviceApis.has(apiName));
    });

    socket.on(SOCKET_EVENT.CREATE_API, (clientId, apiName) => {
      this.serviceApis.set(apiName, (...args) => {
        const socket = this.coreApi.getSocketByClientId(clientId);
        socket.emit(apiName, ...args);
      });
    });

    socket.on(SOCKET_EVENT.DESTROY_API, apiName => {
      if (!apiName) this.serviceApis.clear();
      else this.serviceApis.delete(apiName);
    });

    socket.on(SOCKET_EVENT.USE_API, (apiName, ...args) => {
      const handlerFunction = this.serviceApis.get(apiName);
      handlerFunction.apply(null, args);
    })
  }

  provideService(apiName, handlerFunction) {
    if (this.serviceApis.has(apiName)) throw new Error(`Duplicated API name: ${apiName}`);

    this.serviceApis.set(apiName, handlerFunction);
  }

  destroyService(apiName) {
    if (!this.serviceApis.has(apiName)) return;

    this.serviceApis.delete(apiName);
  }

  destroyAllServices() {
    this.serviceApis.clear();
  }
}

module.exports = P2pServerServiceApi;
