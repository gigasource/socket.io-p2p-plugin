const {SOCKET_EVENT} = require('../../util/constants');

class P2pServerMessageApi {
  constructor(coreApi) {
    this.coreApi = coreApi;
  }

  createListeners(socket, clientId) {
    socket.on(SOCKET_EVENT.MULTI_API_ADD_TARGET, (targetClientId, callback) => {
      const targetClientSocket = socket.getSocketByClientId(targetClientId);
      if (!targetClientSocket) {
        callback(`Client ${targetClientId} is not registered to server`);
        return;
      }

      const disconnectListener = (sk, clientId) => {
        if (sk) sk.emit(SOCKET_EVENT.MULTI_API_TARGET_DISCONNECT, clientId);
      }
      const sourceDisconnectListener = disconnectListener.bind(null, targetClientSocket, clientId); // If source disconnects -> notify target
      const targetDisconnectListener = disconnectListener.bind(null, socket, targetClientId); // If target disconnects -> notify source

      socket.once('disconnect', () => {
        sourceDisconnectListener();

        if (!targetClientSocket) {
          this.coreApi.emitError(socket, new Error(`Could not find target client '${targetClientId}' socket`));
          return;
        }

        targetClientSocket.off('disconnect', targetDisconnectListener);
      });
      targetClientSocket.once('disconnect', () => {
        targetDisconnectListener();
        if (socket) socket.off('disconnect', sourceDisconnectListener);
      });

      targetClientSocket.emit(SOCKET_EVENT.MULTI_API_ADD_TARGET, clientId, callback);
    });
  }
}

module.exports = P2pServerMessageApi;
