const {SOCKET_EVENT} = require('../../util/constants');
const {Duplex} = require('stream');
const uuidv1 = require('uuid/v1');

class P2pServerStreamApi {
  constructor(coreApi) {
    this.coreApi = coreApi;
  }

  createListeners(socket, clientId) {
    socket.on(SOCKET_EVENT.CREATE_STREAM, (connectionInfo, callback) => {
      const {targetClientId} = connectionInfo;
      connectionInfo.sourceClientId = clientId;

      const targetClientSocket = socket.getSocketByClientId(targetClientId);
      if (!targetClientSocket) {
        callback(`Client ${targetClientId} is not registered to server`);
        return;
      }

      const disconnectListener = (sk, clientId) => {
        if (sk) sk.emit(SOCKET_EVENT.TARGET_DISCONNECT, clientId);
      }
      const sourceDisconnectListener = disconnectListener.bind(null, targetClientSocket, clientId); // If source disconnects -> notify target
      const targetDisconnectListener = disconnectListener.bind(null, socket, targetClientId); // If target disconnects -> notify source

      socket.once('disconnect', () => {
        sourceDisconnectListener();

        if (targetClientId.endsWith('-server-side')) return;
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

      targetClientSocket.emit(SOCKET_EVENT.CREATE_STREAM, connectionInfo, callback);
    });
  }

  addStreamAsClient(targetClientId, duplexOptions, callback) {
    const {sourceStreamId, targetStreamId, ...duplexOpts} = duplexOptions || {};

    const socket = this.coreApi.getSocketByClientId(targetClientId);
    const connectionInfo = {
      sourceStreamId: sourceStreamId || uuidv1(),
      targetStreamId: targetStreamId || uuidv1(),
      sourceClientId: targetClientId + '-server-side',
      targetClientId: targetClientId,
    };

    if (callback) {
      socket.emit(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE, {
        targetClientId,
        event: SOCKET_EVENT.CREATE_STREAM,
        args: connectionInfo,
      }, err => {
        if (err) return callback(err);

        const duplex = new ServerSideDuplex(socket, connectionInfo, duplexOpts);
        callback(duplex);
      });
    } else {
      return new Promise((resolve, reject) => {
        socket.emit(SOCKET_EVENT.CREATE_STREAM, connectionInfo, err => {
          if (err) return reject(err);

          const duplex = new ServerSideDuplex(socket, connectionInfo, duplexOpts);
          resolve(duplex);
        });
      });
    }
  }
}

class ServerSideDuplex extends Duplex {
  constructor(socket, connectionInfo, options) {
    super(options);

    const {sourceStreamId, targetStreamId, sourceClientId, targetClientId} = connectionInfo;
    this.writeCallbackFn = null;
    this.sourceStreamId = sourceStreamId;
    this.targetStreamId = targetStreamId;
    this.sourceClientId = sourceClientId;
    this.targetClientId = targetClientId;
    this.socket = socket;

    // Lifecycle handlers & events
    const duplexOnError = (err) => {
      if (err) console.error(`Error thrown by duplex stream: ${err.message}, stream will be destroyed`);
      this.removeListener('error', duplexOnError);
      this.destroy();
      if (this.listenerCount('error') === 0) {
        // Do not suppress the throwing behavior - this 'error' event will be caught by system if not handled by duplex
        this.emit('error', err);
      }
    }

    this.on('error', duplexOnError);

    // Socket.IO Lifecycle
    this.onDisconnect = () => {
      if (!this.destroyed) this.destroy();
    };

    this.onTargetDisconnect = (targetClientId) => {
      if (this.targetClientId === targetClientId) {
        if (!this.destroyed) this.destroy();
      }
    };

    this.onTargetStreamDestroyed = (targetStreamId) => {
      if (this.targetStreamId === targetStreamId) {
        if (!this.destroyed) this.destroy();
      }
    };

    // Socket.IO events
    this.onReceiveStreamData = (data, callbackFn) => {
      let [chunk] = data;
      if (chunk instanceof Array) chunk = Buffer.from(chunk);

      if (!this.push(chunk)) { // if reach highWaterMark -> signal the other client to pause writing
        this.writeCallbackFn = callbackFn;
      } else {
        callbackFn();
      }
    };

    this.clientEmitDataHandler = (emitData, ackFn) => {
      const {targetClientId, event, args} = emitData;
      if (targetClientId !== this.sourceClientId) return;

      const emitEvent = `${SOCKET_EVENT.P2P_EMIT_STREAM}${SOCKET_EVENT.STREAM_IDENTIFIER_PREFIX}${this.targetStreamId}`;
      switch (event) {
        case emitEvent:
          this.onReceiveStreamData(args, ackFn);
          break;
        case SOCKET_EVENT.PEER_STREAM_DESTROYED:
          this.onTargetStreamDestroyed(args);
          break;
        case SOCKET_EVENT.TARGET_DISCONNECT:
          this.onTargetDisconnect(args);
      }
    };

    this.removeSocketListeners = () => {
      this.socket.off(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE, this.clientEmitDataHandler);
      this.socket.off('disconnect', this.onDisconnect);
    }

    this.addSocketListeners = () => {
      this.socket.on(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE, this.clientEmitDataHandler);
      this.socket.once('disconnect', this.onDisconnect);
    }

    this.addSocketListeners();
  }

  // Writable stream handlers & events
  _write(chunk, encoding, callback) {
    const eventName = `${SOCKET_EVENT.P2P_EMIT_STREAM}${SOCKET_EVENT.STREAM_IDENTIFIER_PREFIX}${this.sourceStreamId}`;

    this.socket.emit(eventName, chunk, callback);
  };

  // Readable stream handlers & events
  _read() {
    if (typeof this.writeCallbackFn === 'function') this.writeCallbackFn();
  };

  _destroy() {
    this.removeSocketListeners();

    this.socket.emit(SOCKET_EVENT.P2P_EMIT, {
      targetClientId: this.targetClientId,
      event: SOCKET_EVENT.PEER_STREAM_DESTROYED,
      args: this.sourceStreamId
    });
  };
}

module.exports = P2pServerStreamApi;
