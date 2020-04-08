const {SOCKET_EVENT} = require('../../util/constants');

class P2pServiceApi {
  constructor(socket, p2pMessageApi) {
    this.socket = socket;
    this.p2pMessageApi = p2pMessageApi;
    this.createdTopics = [];
  }

  provideService(apiName, handlerFunction) {
    this.socket.emit(SOCKET_EVENT.CHECK_API_NAME, apiName, apiNameExisted => {
      if (apiNameExisted) {
        throw new Error(`Duplicated API name: ${apiName}`);
      }
      else {
        this.socket.emit(SOCKET_EVENT.CREATE_API, this.p2pMessageApi.clientId, apiName);
        this.socket.on(apiName, handlerFunction);
      }
    });
  }

  destroyService(apiName = '') {
    this.socket.emit(SOCKET_EVENT.DESTROY_API, apiName);
  }

  destroyAllServices() {
    this.socket.emit(SOCKET_EVENT.DESTROY_API);
  }

  emitService(apiName, ...args) {
    this.socket.emit(SOCKET_EVENT.CHECK_API_NAME, apiName, apiNameExisted => {
      if (apiNameExisted) {
        this.socket.emit(SOCKET_EVENT.USE_API, apiName, ...args);
      } else {
        throw new Error(`API is not registered: ${apiName}`)
      }
    });
  }
}

module.exports = P2pServiceApi;
