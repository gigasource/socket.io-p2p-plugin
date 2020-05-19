const {SOCKET_EVENT, SERVER_CONFIG: {SERVER_SIDE_SOCKET_ID_POSTFIX}} = require('../../util/constants');

class P2pServerMessageApi {
  constructor(coreApi) {
    this.coreApi = coreApi;
  }

  createListeners(socket, clientId) {
    socket.on(SOCKET_EVENT.ADD_TARGET, (targetClientId, callback) => {
      const targetClientSocket = this.coreApi.getSocketByClientId(targetClientId);
      if (!targetClientSocket) return callback(`Client ${targetClientId} is not connected to server`);

      this.coreApi.addTargetDisconnectListeners(socket, targetClientSocket, clientId, targetClientId);

      targetClientSocket.emit(SOCKET_EVENT.ADD_TARGET, clientId, callback);
    });
  }
}

module.exports = P2pServerMessageApi;
