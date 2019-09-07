const P2P_EMIT_EVENT = 'P2P_EMIT_EVENT';
const P2P_EMIT_ACKNOWLEDGE_EVENT = 'P2P_EMIT_ACKNOWLEDGE_EVENT';

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

    //todo: handle p2p event
    socket.on(P2P_EMIT_EVENT, function ({targetDeviceId, event, args}) {
      const socketDeviceId = p2pServerManager.getClientSocketId(targetDeviceId);
      io.to(socketDeviceId).emit(event, args);
    });
  });
}
