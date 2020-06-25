const {
  SOCKET_EVENT: {SERVER_ERROR, TARGET_DISCONNECT, JOIN_ROOM, LEAVE_ROOM, EMIT_ROOM, P2P_EMIT},
  HOOK_NAME: {POST_EMIT_TO, POST_EMIT_TO_PERSISTENT_ACK, POST_ALL_CLIENT_SOCKETS_DISCONNECTED},
} = require('../../util/constants');
const findKey = require('lodash/findKey');
const EventEmitter = require('events');

class P2pServerCoreApi {
  constructor(io, options) {
    /*
      virtualClients is a Set of server-created clientIds without real socket
      Example: [ 'clientA--server-side', 'clientB--server-side' ]
      These are used for reusing p2p code of client-server-client scenario for client-server scenario
      -> client will act as if they are communicating with another client in client-server scenario
      see addStreamAsClient function in Server Stream API for example
     */
    this.virtualClients = new Set();
    this.io = io;
    this.ee = new EventEmitter();
    this.logListenerCreated = false;

    this.ackFunctions = {};
    this.saveMessage = options.saveMessage;
    this.deleteMessage = options.deleteMessage;
    this.loadMessages = options.loadMessages;
    this.updateMessage = options.updateMessage;

    /*
      Due to connectivity problem, on some special cases, a client can have 2 (or more) sockets connected to server simultaneously
      this object is used to know when all connected sockets of a client have disconnected
      Example: {
        client1a: ['socket1a', 'socket1b']
      }
     */
    this.clientConnectedSocketsMap = {};
  }

  addSocketToConnectedSocketsMap(clientId, socket) {
    this.clientConnectedSocketsMap[clientId] = this.clientConnectedSocketsMap[clientId] || [];
    this.clientConnectedSocketsMap[clientId].push(socket.id);
  }

  getClientMap() {
    const clientMap = {};
    const connectedSocketMap = this.io.sockets.connected;

    Object.keys(connectedSocketMap).forEach(socketId => {
      const socket = connectedSocketMap[socketId];
      const {clientId, createdTime} = socket;

      if (clientId) {
        const sk = clientMap[clientId];
        if (!sk || (sk.createdTime && sk.createdTime < createdTime)) {
          clientMap[clientId] = socket;
        }
      }
    });

    return clientMap;
  }


  getAllClientId() {
    return Object.keys(this.getClientMap());
  }

  getClientIdBySocketId(socketId) {
    return findKey(this.getClientMap(), socket => socket.id === socketId);
  }

  getSocketIdByClientId(clientId) {
    const socket = this.getClientMap()[clientId];
    return socket ? socket.id : undefined;
  }

  getSocketByClientId(clientId) {
    const socket = this.getClientMap()[clientId];
    return socket ? socket : null;
  }

  // Socket-related functions
  emitError(socket, err) {
    console.error(`Error occurred on server: from client '${this.getClientIdBySocketId(socket.id)}': ${err}`);
    socket.emit(SERVER_ERROR, err.toString());
  }

  emitTo(targetClientId, event, ...args) {
    const targetClientSocket = this.getSocketByClientId(targetClientId);

    if (!targetClientSocket) {
      if (this.io.kareem.hasHooks(POST_EMIT_TO)) {
        this.io.kareem.execPost(POST_EMIT_TO, null, [targetClientId, event, args], err => console.error(err));
      } else {
        console.error((`Client ${targetClientId} is not connected to server`));
      }
    } else {
      targetClientSocket.emit(event, ...args);
    }
  }

  async emitToPersistent(targetClientId, event, args = [], ackFnName, ackFnArgs = []) {
    const missingFunctionError = this.checkRequiredFunctions();
    if (missingFunctionError) throw missingFunctionError;

    if (!args) args = [];
    if (!ackFnArgs) ackFnArgs = [];

    if (!Array.isArray(args)) args = [args];
    if (!Array.isArray(ackFnArgs)) ackFnArgs = [ackFnArgs];

    const messageId = await this.saveMessage(targetClientId, {usageCount: 1, event, args, ackFnName, ackFnArgs});
    if (!messageId) throw new Error('saveMessage function must return a message ID');

    args.push((...targetClientCallbackArgs) => {
      this.deleteMessage(targetClientId, messageId);

      const ackFunctions = this.ackFunctions[ackFnName] || [];
      ackFunctions.forEach(fn => fn(...(ackFnArgs.concat(targetClientCallbackArgs))));
    });
    this.emitTo(targetClientId, event, ...args);

    // message won't be sent again if this function is called
    return () => this.deleteMessage(targetClientId, messageId);
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

  sendSavedMessages(targetClientId) {
    const missingFunctionError = this.checkRequiredFunctions();
    if (missingFunctionError) return;

    (async () => {
      const savedMessages = await this.loadMessages(targetClientId);

      if (!savedMessages || savedMessages.length === 0) return;
      savedMessages.forEach(({_id, usageCount, event, args, ackFnName, ackFnArgs}) => {
        if (usageCount > 1) {
          const warning = `Warning: a message of event ${event} was sent by emitToPersistent ${usageCount} times, ` +
              `remember to call the ack function on receiver side to delete sent message`;
          console.warn(warning);
        }

        this.updateMessage(targetClientId, _id, {usageCount: usageCount + 1});

        this.emitTo(targetClientId, event, ...args, (...targetClientCallbackArgs) => {
          this.deleteMessage(targetClientId, _id);

          const ackFunctions = this.ackFunctions[ackFnName] || [];

          if (ackFunctions.length > 0) {
            ackFunctions.forEach(fn => fn(...(ackFnArgs.concat(targetClientCallbackArgs))));
          } else {
            /*
              NOTE: current library usage make all instances have identical ackFunctions so this code will not be executed
              However if in the future, ackFunctions are not identical across instances, this code can be useful
              But an improvement is required: make sure identical ackFunctions across instances are only triggered once to avoid side effects
             */
            if (this.io.kareem.hasHooks(POST_EMIT_TO_PERSISTENT_ACK)) {
              this.io.kareem.execPost(POST_EMIT_TO_PERSISTENT_ACK, null, [ackFnName, ackFnArgs.concat(targetClientCallbackArgs)], () => {
              });
            }
          }
        });
      });
    })();
  }

  checkRequiredFunctions() {
    if (typeof this.saveMessage !== 'function' || typeof this.deleteMessage !== 'function'
        || typeof this.loadMessages !== 'function' || typeof this.updateMessage !== 'function') {
      return new Error('You must provide all 4 functions: saveMessage, deleteMessage, loadMessages, updateMessage to use emiToPersistent');
    }
  }

  createListeners(io, socket, clientId) {
    socket.once('disconnect', () => {
      if (this.clientConnectedSocketsMap[clientId]) {
        this.clientConnectedSocketsMap[clientId] = this.clientConnectedSocketsMap[clientId].filter(e => e !== socket.id);

        if (this.clientConnectedSocketsMap[clientId].length === 0) {
          delete this.clientConnectedSocketsMap[clientId];

          if (this.io.kareem.hasHooks(POST_ALL_CLIENT_SOCKETS_DISCONNECTED)) {
            this.io.kareem.execPost(POST_ALL_CLIENT_SOCKETS_DISCONNECTED, null, [clientId, socket], () => {
            });
          }
        }
      }
    });

    const p2pEmitListener = (targetClientId, event, args, acknowledgeFn) => {
      if (acknowledgeFn) args.push(acknowledgeFn);
      const targetClientSocket = this.getSocketByClientId(targetClientId);

      if (!targetClientSocket) {
        if (this.io.kareem.hasHooks(POST_EMIT_TO)) {
          this.io.kareem.execPost(POST_EMIT_TO, null, [targetClientId, event, args], err => err & this.emitError(socket, err));
        } else {
          if (this.virtualClients.has(targetClientId)) return;

          const error = new Error(`Client ${targetClientId} is not connected to server`);
          this.emitError(socket, error);
        }
      } else {
        targetClientSocket.emit(event, ...args);
      }
    };

    socket.on(P2P_EMIT, p2pEmitListener);

    socket.on(JOIN_ROOM, (roomName, callback) => {
      socket.join(roomName, callback);
    });
    socket.on(LEAVE_ROOM, (roomName, callback) => {
      socket.leave(roomName, callback);
    });
    socket.on(EMIT_ROOM, (roomName, event, ...args) => {
      socket.to(roomName).emit(event, ...args)
    });
  }

  addTargetDisconnectListeners(socket, targetClientSocket, clientId, targetClientId) {
    let sourceDisconnectListener, targetDisconnectListener;

    sourceDisconnectListener = () => {
      if (targetClientSocket) {
        targetClientSocket.emit(TARGET_DISCONNECT, clientId);
        targetClientSocket.off('disconnect', targetDisconnectListener);
      }
    } // If source disconnects -> notify target

    targetDisconnectListener = () => {
      if (socket) {
        socket.emit(TARGET_DISCONNECT, targetClientId);
        socket.off('disconnect', sourceDisconnectListener);
      }
    } // If target disconnects -> notify source

    socket.once('disconnect', sourceDisconnectListener);
    targetClientSocket.once('disconnect', targetDisconnectListener);
  }

  onLibLog(callback) {
    this.logListenerCreated = true;
    this.ee.on('libLog', callback);
  }

  emitLibLog(...args) {
    if (this.logListenerCreated) {
      this.ee.emit('libLog', ...args);
    } else {
      if (args.length > 0) console.debug(args[0]);
    }
  }

  initSocketBasedApis(socket) {
    // socket.on(LIST_CLIENTS, clientCallbackFn => clientCallbackFn(this.getAllClientId()));
  }
}

module.exports = P2pServerCoreApi;
