const {SOCKET_EVENT: {CHECK_API_NAME, DESTROY_API, USE_API, CREATE_API}} = require('../../util/constants');

class P2pServiceApi {
  constructor(socket) {
    this.socket = socket;
    this.createdApis = new Set();
  }

  provideService(apiName, handlerFunction, errorHandler) {
    this.socket.emit(CHECK_API_NAME, apiName, apiNameExisted => {
      if (apiNameExisted) {
        const errMsg = `Duplicated API name: ${apiName}`;
        console.error(errMsg + ', provideService function call will not have any effects')
        typeof errorHandler === 'function' && errorHandler(errMsg);
      } else {
        this.socket.emit(CREATE_API, apiName);
        this.socket.on(apiName, handlerFunction);
        this.createdApis.add(apiName);
      }
    });
  }

  destroyService(apiName = '') {
    this.socket.emit(DESTROY_API, apiName);
    this.socket.off(apiName);
  }

  destroyAllServices() {
    this.socket.emit(DESTROY_API);
    this.createdApis.forEach(apiName => this.socket.off(apiName));
  }

  emitService(apiName, ...args) {
    this.socket.emit(CHECK_API_NAME, apiName, apiNameExisted => {
      if (apiNameExisted) {
        this.socket.emit(USE_API, apiName, ...args);
      } else {
        console.error(`API is not registered: ${apiName}`);
      }
    });
  }
}

module.exports = P2pServiceApi;
