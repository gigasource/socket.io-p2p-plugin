const {SOCKET_EVENT} = require('../../util/constants');

class P2pServiceApi {
  constructor(socket) {
    this.socket = socket;
    this.createdApis = new Set();
  }

  provideService(apiName, handlerFunction, errorHandler) {
    this.socket.emit(SOCKET_EVENT.CHECK_API_NAME, apiName, apiNameExisted => {
      if (apiNameExisted) {
        const errMsg = `Duplicated API name: ${apiName}`;
        console.error(errMsg + ', provideService function call will not have any effects')
        typeof errorHandler === 'function' && errorHandler(errMsg);
      } else {
        this.socket.emit(SOCKET_EVENT.CREATE_API, apiName);
        this.socket.on(apiName, handlerFunction);
        this.createdApis.add(apiName);
      }
    });
  }

  destroyService(apiName = '') {
    this.socket.emit(SOCKET_EVENT.DESTROY_API, apiName);
    this.socket.off(apiName);
  }

  destroyAllServices() {
    this.socket.emit(SOCKET_EVENT.DESTROY_API);
    this.createdApis.forEach(apiName => this.socket.off(apiName));
  }

  emitService(apiName, ...args) {
    this.socket.emit(SOCKET_EVENT.CHECK_API_NAME, apiName, apiNameExisted => {
      if (apiNameExisted) {
        this.socket.emit(SOCKET_EVENT.USE_API, apiName, ...args);
      } else {
        console.error(`API is not registered: ${apiName}`);
      }
    });
  }
}

module.exports = P2pServiceApi;
