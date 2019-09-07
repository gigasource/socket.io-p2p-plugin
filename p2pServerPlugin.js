const P2P_EMIT_EVENT = 'P2P_EMIT_EVENT';
const P2P_EMIT_ACKNOWLEDGE_EVENT = 'P2P_EMIT_ACKNOWLEDGE_EVENT';
const P2P_REGISTER = 'P2P_REGISTER';
const P2P_DISCONNECT = 'P2P_DISCONNECT';

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
    let targetId;
    p2pServerManager.addClient(deviceId, socket.id);

    //lifecycle
    socket.on('disconnect', reason => {
      console.log('disconnect');
      p2pServerManager.removeClient(deviceId);
      const socketDeviceId = p2pServerManager.getClientSocketId(targetId);
      io.to(socketDeviceId).emit(P2P_DISCONNECT);
    });

    socket.on('reconnect', attemptNumber => {
      console.log('reconnect');
      p2pServerManager.addClient(deviceId, socket.id);
    });

    socket.on(P2P_REGISTER, (targetDeviceId) => {
      const socketDeviceId = p2pServerManager.getClientSocketId(targetDeviceId);
      io.to(socketDeviceId).emit(P2P_REGISTER, deviceId);
    });

    socket.on(P2P_EMIT_EVENT, (args) => {
      emitEvent(args);
    });

    socket.on(P2P_EMIT_ACKNOWLEDGE_EVENT, (args, acknowledgeFn) => {
      emitEvent(args);

      acknowledgeFn('Server acknowledged');
    });

    const emitEvent = ({targetDeviceId, event, args}) => {
      const socketDeviceId = p2pServerManager.getClientSocketId(targetDeviceId);
      io.to(socketDeviceId).emit(event, args);
    };
  });
}
