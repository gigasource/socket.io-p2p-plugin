const {SOCKET_EVENT, SOCKET_EVENT_ACTION} = require('../../util/constants');

class P2pServiceApi {
  constructor(socket, p2pMultiMessageApi) {
    this.socket = socket;
    this.p2pMultiMessageApi = p2pMultiMessageApi;
    this.jobCallbackId = 0;

    // jobs {name, callbacks[]}
  }

  emitService(serviceName, api, ...args) {
    this.p2pMultiMessageApi.emitTo(serviceName, api, ...args)
  }

  provideService(api, callback) {
    this.p2pMultiMessageApi.onAny(api, callback);
  }

  onService(serviceName, taskName, callback) {
    this.p2pMultiMessageApi.from(serviceName).on(taskName, callback);
  }

  publishService(roomName, callback) {
    this.socket.emit(SOCKET_EVENT.JOIN_ROOM, SOCKET_EVENT_ACTION.PUBLISH_SERVICE, roomName, callback);
  }

  subscribeClient(clientId, roomName, callback) {
    this.socket.emit(SOCKET_EVENT.JOIN_ROOM, SOCKET_EVENT_ACTION.SUBSCRIBE_CLIENT, clientId, roomName, callback);
  }
}

module.exports = P2pServiceApi;
