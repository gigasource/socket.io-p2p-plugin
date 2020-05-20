const {
  SOCKET_EVENT: {SERVER_ERROR, TARGET_DISCONNECT, JOIN_ROOM, LEAVE_ROOM, EMIT_ROOM, P2P_EMIT, LIST_CLIENTS},
  SERVER_CONFIG: {SERVER_SIDE_SOCKET_ID_POSTFIX},
  HOOK_NAME: {POST_EMIT_TO, POST_EMIT_TO_PERSISTENT_ACK},
} = require('../../util/constants');
const findKey = require('lodash/findKey');
const EventEmitter = require('events');

class P2pServerCoreApi {
  constructor(io, options) {
    /*
      clientMap is an object of connected clients with key = clientId & value = socket.id
      Example: { clientA: '<id of connected socket>' }
     */
    this.clientMap = {};

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

    this.ackFunctions = {};
    this.saveMessage = options.saveMessage;
    this.deleteMessage = options.deleteMessage;
    this.loadMessages = options.loadMessages;
    this.updateMessage = options.updateMessage;
  }

  addClient(clientId, clientSocketId) {
    if (!clientId) throw new Error('clientId can not be null');

    // support client overwriting
    if (this.clientMap[clientId]) {
      const oldSocket = this.getSocketByClientId(clientId);
      if (oldSocket) {
        oldSocket.removeAllListeners();
        oldSocket.disconnect(true);
      }
    }

    this.clientMap[clientId] = clientSocketId;
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

  emitToPersistent(targetClientId, event, args = [], ackFnName, ackFnArgs = []) {
    const missingFunctionError = this.checkRequiredFunctions();
    if (missingFunctionError) throw missingFunctionError;

    if (!args) args = [];
    if (!ackFnArgs) ackFnArgs = [];

    if (!Array.isArray(args)) args = [args];
    if (!Array.isArray(ackFnArgs)) ackFnArgs = [ackFnArgs];

    (async () => {
      const messageId = await this.saveMessage(targetClientId, {usageCount: 1, event, args, ackFnName, ackFnArgs});

      if (!messageId) throw new Error('saveMessage function must return a message ID');

      args.push((...targetClientCallbackArgs) => {
        this.deleteMessage(targetClientId, messageId);

        const ackFunctions = this.ackFunctions[ackFnName] || [];
        ackFunctions.forEach(fn => fn(...(ackFnArgs.concat(targetClientCallbackArgs))));
      });

      this.emitTo(targetClientId, event, ...args);
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
      this.removeClient(clientId);
    });

    const p2pEmitListener = (targetClientId, event, args, acknowledgeFn) => {
      if (acknowledgeFn) args.push(acknowledgeFn);
      const targetClientSocket = this.getSocketByClientId(targetClientId);

      if (!targetClientSocket) {
        if (this.io.kareem.hasHooks(POST_EMIT_TO)) {
          this.io.kareem.execPost(POST_EMIT_TO, null, [targetClientId, event, args], err => err & this.emitError(socket, err));
        } else {
          if (targetClientId.endsWith(SERVER_SIDE_SOCKET_ID_POSTFIX)) return;

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

  initSocketBasedApis(socket) {
    // socket.on(LIST_CLIENTS, clientCallbackFn => clientCallbackFn(this.getAllClientId()));
  }
}

module.exports = P2pServerCoreApi;
