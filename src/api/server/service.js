const {SOCKET_EVENT: {CHECK_API_NAME, CREATE_API, DESTROY_API, USE_API}} = require('../../util/constants');

class P2pServerServiceApi {
  constructor() {
    this.serviceApis = {};
  }

  // Services created by clients
  createListeners(io, socket) {
    const destroyApi = apiName => {
      if (!apiName) {
        Object.keys(this.serviceApis).forEach(key => {
          if (this.serviceApis[key].clientId === socket.clientId) delete this.serviceApis[key];
        });
      } else {
        if (this.serviceApis[apiName].clientId === socket.clientId) delete this.serviceApis[apiName];
      }
    }

    socket.on(CHECK_API_NAME, (apiName, callback) => {
      callback(!!this.serviceApis[apiName]);
    });

    socket.on(CREATE_API, apiName => {
      this.serviceApis[apiName] = {
        clientId: socket.clientId,
        fn: (...args) => socket.emit(apiName, ...args)
      }
    });

    socket.on(DESTROY_API, destroyApi);

    socket.on(USE_API, (apiName, ...args) => {
      const {fn: handlerFunction} = this.serviceApis[apiName];
      if (handlerFunction) handlerFunction.apply(null, args);
    });

    socket.once('disconnect', () => destroyApi());
  }

  // Services created by server
  provideService(apiName, handlerFunction) {
    if (this.serviceApis[apiName])
      return console.error(`Service: Duplicated API name: ${apiName}, created service will have no effects`);

    this.serviceApis[apiName] = {
      fn: handlerFunction,
      createdByServer: true,
    };
  }

  destroyService(apiName) {
    if (!this.serviceApis[apiName]) return;

    delete this.serviceApis[apiName];
  }

  destroyAllServices() {
    Object.keys(this.serviceApis).forEach(apiName => {
      if (this.serviceApis[apiName].createdByServer) this.destroyService(apiName);
    });
  }
}

module.exports = P2pServerServiceApi;
