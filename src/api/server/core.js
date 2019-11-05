const {SOCKET_EVENT, SOCKET_EVENT_ACTION} = require('../../util/constants');
const findKey = require('lodash/findKey');

class P2pServerCoreApi {
  constructor(io) {
    this.clientMap = {};
    this.io = io;
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

  getSocketByClientId(targetClientId) {
    return this.io.sockets.connected[this.getSocketIdByClientId(targetClientId)];
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
      //todo: filter mechanism to deny access to room
      let clientId, roomName, callback;

      if (action === SOCKET_EVENT_ACTION.CLIENT_SUBSCRIBE_TOPIC) {
        [clientId, roomName, callback] = args;
        const sk = this.getSocketByClientId(clientId);

        if (!sk) {
          if (callback) callback(new Error(`Join room error: can not find socket for client ${clientId}`));
          return;
        }

        sk.join(roomName);
      }
      else {
        [roomName, callback] = args;
        socket.join(roomName);
      }

      if (callback) callback();
    });
    socket.on(SOCKET_EVENT.LEAVE_ROOM, (action, ...args) => {
      let clientId, roomName, callback;

      if (action === SOCKET_EVENT_ACTION.CLIENT_UNSUBSCRIBE_TOPIC) {
        [clientId, roomName] = args;
        const sk = this.getSocketByClientId(clientId);
        if (sk) sk.leave(roomName, null);
      }
      else if (action === SOCKET_EVENT_ACTION.SERVICE_DESTROY_TOPIC) {
        //todo: is callback needed?
        [roomName, callback] = args;
        const socketsInRoom = io.sockets.adapter.rooms[roomName].sockets;

        if (socketsInRoom) {
          Object.keys(socketsInRoom).forEach(key => {
            const sk = io.sockets.connected[key];
            sk.emit(`${roomName}-${SOCKET_EVENT.TOPIC_BEING_DESTROYED}`);
            sk.leave(roomName, null);
          });
        }
      }
      else {
        [roomName, callback] = args;
        socket.leave(roomName, null);
      }

      if (callback) callback();
    });
    socket.on(SOCKET_EVENT.EMIT_ROOM, (roomName, event, ...args) => {
      //todo: filter mechanism to deny access to room
      socket.to(roomName).emit(event, ...args);
    });
  }

  initSocketBasedApis(socket) {
    socket.on(SOCKET_EVENT.LIST_CLIENTS, clientCallbackFn => clientCallbackFn(this.getAllClientId()));
  }
}

module.exports = P2pServerCoreApi;
