const {SOCKET_EVENT} = require('./util/constants');

class P2pServerManager {
  constructor(io) {
    this.io = io;
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
  const p2pServerManager = new P2pServerManager(io);

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

    socket.on(SOCKET_EVENT.P2P_REGISTER, (targetDeviceId) => {
      const socketDeviceId = p2pServerManager.getClientSocketId(targetDeviceId);
      io.to(socketDeviceId).emit(SOCKET_EVENT.P2P_REGISTER, deviceId);

      socket.once('disconnect', () => io.to(socketDeviceId).emit(SOCKET_EVENT.P2P_DISCONNECT));
      io.sockets.connected[socketDeviceId].once('disconnect', () => socket.emit(SOCKET_EVENT.P2P_DISCONNECT));
    });

    socket.on(SOCKET_EVENT.P2P_EMIT, (args) => {
      emitEvent(args);
    });

    socket.on(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE, (args, acknowledgeFn) => {
      emitEvent(args);

      acknowledgeFn('Server acknowledged');
    });

    const emitEvent = ({targetDeviceId, event, args}) => {
      const socketDeviceId = p2pServerManager.getClientSocketId(targetDeviceId);
      io.to(socketDeviceId).emit(event, args);
    };
  });
};
