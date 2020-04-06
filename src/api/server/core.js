const {SOCKET_EVENT, SOCKET_EVENT_ACTION} = require('../../util/constants');
const findKey = require('lodash/findKey');
const EventEmitter = require('events');

class P2pServerCoreApi {
  constructor(io) {
    this.clientMap = {};
    this.io = io;
    this.ee = new EventEmitter();
  }

  addClient(clientId, clientSocketId) {
    if (clientId) {
      this.clientMap[clientId] = clientSocketId;
    }
  }

  removeClient(clientId) {
    delete this.clientMap[clientId];
  }

  getAllClientId() {
    return Object.keys(this.clientMap);
  }

  getClientIdBySocketId(socketId) {
    return findKey(this.clientMap, (v) => v === socketId);
  }

  getSocketIdByClientId(clientId) {
    return this.clientMap[clientId];
  }

  getSocketByClientId(clientId) {
    return this.io.sockets.connected[this.getSocketIdByClientId(clientId)];
  }

  // Socket-related functions
  emitError(socket, err) {
    console.error(`Error occurred on server: from client '${this.getClientIdBySocketId(socket.id)}': ${err}`);
    socket.emit(SOCKET_EVENT.SERVER_ERROR, err.toString());
  }

  createListeners(io, socket, clientId) {
    socket.on('disconnect', () => {
      this.removeClient(clientId);
    });

    this.p2pEmitListener = ({targetClientId, event, args}) => {
      const targetClientSocket = socket.getSocketByClientId(targetClientId);
      if (targetClientSocket) targetClientSocket.emit(event, ...args);
    };
    this.p2pEmitAckListener = ({targetClientId, event, args}, acknowledgeFn) => {
      const targetClientSocket = socket.getSocketByClientId(targetClientId);
      if (targetClientSocket) targetClientSocket.emit(event, ...args, acknowledgeFn);
    };

    socket.on(SOCKET_EVENT.P2P_EMIT, this.p2pEmitListener);
    socket.on(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE, this.p2pEmitAckListener);
    socket.on(SOCKET_EVENT.JOIN_ROOM, (action, ...args) => {
      const excludedActions = [SOCKET_EVENT_ACTION.CLIENT_SUBSCRIBE_TOPIC, SOCKET_EVENT_ACTION.SERVICE_CREATE_TOPIC];

      if (excludedActions.includes(action)) return;

      const [roomName, callback] = args;
      socket.join(roomName);
      if (callback) callback();
    });
    socket.on(SOCKET_EVENT.LEAVE_ROOM, (action, ...args) => {
      const excludedActions = [SOCKET_EVENT_ACTION.CLIENT_UNSUBSCRIBE_TOPIC, SOCKET_EVENT_ACTION.SERVICE_DESTROY_TOPIC];

      if (excludedActions.includes(action)) return;

      const [roomName, callback] = args;
      socket.leave(roomName, null);
      if (callback) callback();
    });
    socket.on(SOCKET_EVENT.EMIT_ROOM, (roomName, event, ...args) => {
      socket.to(roomName).emit(event, ...args);
    });
  }

  initSocketBasedApis(socket) {
    socket.on(SOCKET_EVENT.LIST_CLIENTS, clientCallbackFn => clientCallbackFn(this.getAllClientId()));
  }

  applyWhenConnect(targetClientId, fn) {
    if (this.clientMap[targetClientId]) return fn();
    this.ee.once(`${targetClientId}@connected`, fn);
  }
}

module.exports = P2pServerCoreApi;
