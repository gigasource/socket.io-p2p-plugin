const {SOCKET_EVENT} = require('../../util/constants');
const findKey = require('lodash/findKey');
const EventEmitter = require('events');

class P2pServerCoreApi {
  constructor(io, options) {
    this.clientMap = {};
    this.io = io;
    this.createdTopics = new Set();
    this.ee = new EventEmitter();

    this.ackFunctions = {};
    this.saveMessage = options.saveMessage;
    this.deleteMessage = options.deleteMessage;
    this.loadMessages = options.loadMessages;
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
    if (!this.clientMap[clientId]) return null;

    return this.io.sockets.connected[this.getSocketIdByClientId(clientId)];
  }

  // Socket-related functions
  emitError(socket, err) {
    console.error(`Error occurred on server: from client '${this.getClientIdBySocketId(socket.id)}': ${err}`);
    socket.emit(SOCKET_EVENT.SERVER_ERROR, err.toString());
  }

  emitTo(targetClientId, event, ...args) {
    const targetClientSocket = this.getSocketByClientId(targetClientId);
    if (!targetClientSocket) throw new Error(`Can not find socket of client ${targetClientId}`);
    targetClientSocket.emit(event, ...args);
  }

  emitToPersistent(targetClientId, event, args, ackFnName, ackFnArgs) {
    if (!Array.isArray(args)) args = [args];
    if (!Array.isArray(ackFnArgs)) ackFnArgs = [ackFnArgs];

    if (typeof this.saveMessage !== 'function' || typeof this.deleteMessage !== 'function') {
      throw new Error('Missing saveMessage and deleteMessage function, please provide when you initialize server plugin');
    }

    (async () => {
      const messageId = await this.saveMessage(targetClientId, {event, args, ackFnName, ackFnArgs});

      if (!messageId) throw new Error('saveMessage function must return a message ID');

      const targetClientSocket = this.getSocketByClientId(targetClientId);

      if (targetClientSocket) {
        targetClientSocket.emit(event, ...args, () => {
          this.deleteMessage(targetClientId, messageId);

          const ackFunctions = this.ackFunctions[ackFnName] || [];
          ackFunctions.forEach(fn => fn(...ackFnArgs));
        });
      }
    })()
  }

  registerAckFunction(name, fn) {
    this.ackFunctions[name] = this.ackFunctions[name] || [];
    this.ackFunctions[name].push(fn);
  }

  unregisterAckFunction(name, fn) {
    this.ackFunctions[name] = this.ackFunctions[name] || [];

    if (fn) {
      this.ackFunctions[name] = this.ackFunctions[name].filter(e => e !== fn);
    } else {
      delete this.ackFunctions[name];
    }
  }

  sendSavedMessages(targetClientId, socket) {
    if (typeof this.loadMessages !== 'function' || typeof this.deleteMessage !== 'function') return;

    (async () => {
      const savedMessages = await this.loadMessages(targetClientId)

      if (!savedMessages || savedMessages.length === 0) return;
      savedMessages.forEach(({_id, event, args, ackFnName, ackFnArgs}) => {
        socket.emit(event, ...args, () => {
          this.deleteMessage(targetClientId, _id);

          const ackFunctions = this.ackFunctions[ackFnName] || [];
          ackFunctions.forEach(fn => fn(...ackFnArgs));
        });
      });
    })();
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
    socket.on(SOCKET_EVENT.CHECK_TOPIC_NAME, (topicName, callback) => {
      callback(this.createdTopics.has(topicName))
    });
    socket.on(SOCKET_EVENT.CREATE_TOPIC, (topicName, callback) => {
      this.createTopic(topicName, callback);
    });
    socket.on(SOCKET_EVENT.DESTROY_TOPIC, (topicName, callback) => {
      this.destroyTopic(topicName, callback);
    });
    socket.on(SOCKET_EVENT.JOIN_ROOM, (roomName, callback) => {
      socket.join(roomName, callback);
    });
    socket.on(SOCKET_EVENT.LEAVE_ROOM, (roomName, callback) => {
      socket.leave(roomName, callback);
    });
    socket.on(SOCKET_EVENT.EMIT_ROOM, (roomName, event, ...args) => {
      socket.to(roomName).emit(event, ...args)
    });
  }

  createTopic(topicName, callback) {
    this.createdTopics.add(topicName);
    if (callback) callback();
  }

  destroyTopic(topicName, callback) {
    this.createdTopics.delete(topicName);
    const socketsInRoom = this.io.sockets.adapter.rooms[topicName].sockets;

    if (socketsInRoom) {
      Object.keys(socketsInRoom).forEach(key => {
        const sk = this.io.sockets.connected[key];
        sk.emit(`${topicName}-${SOCKET_EVENT.TOPIC_BEING_DESTROYED}`);
        sk.leave(topicName, null);
      });
    }

    if (callback) callback();
  }

  publishTopic(topicName, ...args) {
    this.io.to(topicName).emit(`${topicName}-${SOCKET_EVENT.DEFAULT_TOPIC_EVENT}`, ...args);
  }

  initSocketBasedApis(socket) {
    socket.on(SOCKET_EVENT.LIST_CLIENTS, clientCallbackFn => clientCallbackFn(this.getAllClientId()));
  }
}

module.exports = P2pServerCoreApi;
