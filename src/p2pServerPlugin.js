const {SOCKET_EVENT} = require('./util/constants');

class P2pServerManager {
  constructor() {
    this.deviceMap = {};
  }

  addClient(clientId, clientSocketId) {
    this.deviceMap[clientId] = clientSocketId;
  }

  removeClient(clientId) {
    delete this.deviceMap[clientId];
  }

  getClientSocketId(clientId) {
    return this.deviceMap[clientId];
  }
}

module.exports = function p2pServerPlugin(io) {
  const p2pServerManager = new P2pServerManager();

  io.on('connect', (socket) => {
    const {deviceId} = socket.request._query;
    p2pServerManager.addClient(deviceId, socket.id);

    //lifecycle
    socket.on('disconnect', reason => {
      p2pServerManager.removeClient(deviceId);
    });

    socket.on('reconnect', attemptNumber => {
      p2pServerManager.addClient(deviceId, socket.id);
    });

    socket.on(SOCKET_EVENT.P2P_REGISTER, (targetDeviceId, clientCallbackFn) => {
      const targetDeviceSocketId = p2pServerManager.getClientSocketId(targetDeviceId);

      if (!targetDeviceSocketId) {
        // targetAvailable = false; (device is not currently online)
        clientCallbackFn(false);
        return;
      }

      io.to(targetDeviceSocketId).emit(SOCKET_EVENT.P2P_REGISTER, deviceId);

      const targetDeviceSocket = io.sockets.connected[targetDeviceSocketId];
      targetDeviceSocket.once(SOCKET_EVENT.P2P_REGISTER_SUCCESS, () => {
        socket.once('disconnect', () => io.to(targetDeviceSocketId).emit(SOCKET_EVENT.P2P_DISCONNECT));
        targetDeviceSocket.once('disconnect', () => socket.emit(SOCKET_EVENT.P2P_DISCONNECT));

        // targetAvailable = true; (successful connection)
        clientCallbackFn(true);
      });

      targetDeviceSocket.once(SOCKET_EVENT.P2P_REGISTER_FAILED, () => {
        // targetAvailable = false; (target device declined the connection)
        clientCallbackFn(false);
      });
    });

    socket.on(SOCKET_EVENT.P2P_EMIT, ({targetDeviceId, event, args}) => {
      const targetDeviceSocketId = p2pServerManager.getClientSocketId(targetDeviceId);
      io.to(targetDeviceSocketId).emit(event, ...args);
    });

    socket.on(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE, ({targetDeviceId, event, args}, acknowledgeFn) => {
      const targetDeviceSocketId = p2pServerManager.getClientSocketId(targetDeviceId);
      const targetDeviceSocket = io.sockets.connected[targetDeviceSocketId];

      targetDeviceSocket.emit(event, ...args, acknowledgeFn);
    });
  });
};
