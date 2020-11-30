const {
  SOCKET_EVENT: {
    P2P_EMIT_STREAM, PEER_STREAM_DESTROYED, TARGET_DISCONNECT, P2P_EMIT, CREATE_STREAM,
    STREAM_IDENTIFIER_PREFIX,
  },
  INTERNAL_EMITTER_EVENT: {DATA_FROM_ANOTHER_SERVER},
  SERVER_CONFIG: {SERVER_SIDE_SOCKET_ID_POSTFIX},
  MISC_CONFIG: {INIT_STREAM_TIMEOUT},
} = require('../../util/constants');
const {Duplex} = require('stream');
const uuidv1 = require('uuid/v1');

class P2pServerStreamApi {
  constructor(coreApi) {
    this.coreApi = coreApi;
    // stream for cluster environment, data will be received from adapter (currently only supports Redis)
    this.coreApi.ee.on(DATA_FROM_ANOTHER_SERVER, (targetClientId, event, ...args) => {
      const ackFn = args.pop();
      this.streamDataHandler(targetClientId, event, args, ackFn);
    });
  }

  streamDataHandler(targetClientId, event, args, ackFn) {
    if (!event) return;

    if (event.startsWith(P2P_EMIT_STREAM)) {
      this.coreApi.ee.emit(event, args, ackFn);
    } else if (event === PEER_STREAM_DESTROYED) {
      // args is id of receiver-side stream
      this.coreApi.ee.emit(PEER_STREAM_DESTROYED, args);
    } else if (event === TARGET_DISCONNECT) {
      // args is id of disconnected client
      this.coreApi.ee.emit(TARGET_DISCONNECT, args);
    }
  };

  createListeners(socket, clientId) {
    socket.on(P2P_EMIT, this.streamDataHandler.bind(this));

    // stream for normal socket connection
    socket.on(CREATE_STREAM, (connectionInfo, callback) => {
      const {targetClientId, channel} = connectionInfo;
      connectionInfo.sourceClientId = clientId;

      const targetClientSocket = this.coreApi.getSocketByClientId(targetClientId);
      if (!targetClientSocket) return callback(`Client ${targetClientId} is not connected to server`);

      this.coreApi.addTargetDisconnectListeners(socket, targetClientSocket, clientId, targetClientId);

      let event = CREATE_STREAM;
      if (channel) event += `-CHANNEL-${channel}`;
      targetClientSocket.emit(event, connectionInfo, callback);
    });
  }

  addStreamAsClient(targetClientId, channelOrArgArrayOrCallback, duplexOptions, callback) {
    let channel;
    let argArray;

    if (typeof channelOrArgArrayOrCallback === 'string') {
      // addStreamAsClient('clientId', 'channel', {}, () => {});
      channel = channelOrArgArrayOrCallback;
    } else if (Array.isArray(channelOrArgArrayOrCallback)) {
      // addStreamAsClient('clientId', [1, 2, 3], {}, () => {});
      argArray = channelOrArgArrayOrCallback;
    } else if (typeof channelOrArgArrayOrCallback === 'function') {
      // addStreamAsClient('clientId', () => {});
      callback = channelOrArgArrayOrCallback;
      duplexOptions = {};
    } else {
      // backward compatibility
      // addStreamAsClient('clientId', {}, () => {});
      callback = duplexOptions;
      duplexOptions = channelOrArgArrayOrCallback;
    }

    const {sourceStreamId, targetStreamId, ...duplexOpts} = duplexOptions || {};

    const connectionInfo = {
      sourceStreamId: sourceStreamId || uuidv1(),
      targetStreamId: targetStreamId || uuidv1(),
      sourceClientId: uuidv1() + SERVER_SIDE_SOCKET_ID_POSTFIX,
      targetClientId: targetClientId,
      ...channel && {channel},
      ...argArray && {argArray},
    };

    let event = CREATE_STREAM;
    if (channel) event += `-CHANNEL-${channel}`;

    if (callback) {
      this.coreApi.emitTo(targetClientId, event, connectionInfo, err => {
        if (err) return callback(err);

        const duplex = new ServerSideDuplex(this.coreApi, connectionInfo, duplexOpts);
        callback(duplex);
      });
    } else {
      return new Promise((resolve, reject) => {
        const timeout = duplexOpts.initStreamTimeout || INIT_STREAM_TIMEOUT;
        const cancelTimeout = setTimeout(() =>
                reject(`addP2pStream error: target client response timeout (${timeout}ms) exceeded`),
            timeout);

        this.coreApi.emitTo(targetClientId, event, connectionInfo, err => {
          clearTimeout(cancelTimeout);
          if (err) return reject(err);

          const duplex = new ServerSideDuplex(this.coreApi, connectionInfo, duplexOpts);
          resolve(duplex);
        });
      });
    }
  }
}

class ServerSideDuplex extends Duplex {
  constructor(coreApi, connectionInfo, options) {
    if (options.onDisconnect && typeof options.onDisconnect !== 'function')
      throw new Error('onDisconnect option must be function');
    if (options.onTargetDisconnect && typeof options.onTargetDisconnect !== 'function')
      throw new Error('onTargetDisconnect option must be function');
    if (options.onTargetStreamDestroyed && typeof options.onTargetStreamDestroyed !== 'function')
      throw new Error('onTargetStreamDestroyed option must be function');

    const {ignoreStreamError, ...opts} = options

    super(opts);

    const {sourceStreamId, targetStreamId, sourceClientId, targetClientId} = connectionInfo;
    this.writeCallbackFn = null;
    this.sourceStreamId = sourceStreamId;
    this.targetStreamId = targetStreamId;
    this.sourceClientId = sourceClientId;
    this.targetClientId = targetClientId;
    this.coreApi = coreApi;

    coreApi.virtualClients.add(sourceClientId);

    // Lifecycle handlers & events
    const duplexOnError = (err) => {
      if (err) console.error(`Error thrown by duplex stream: ${err.message}, stream will be destroyed`);
      this.removeListener('error', duplexOnError);
      this.destroy();
      if (this.listenerCount('error') === 0) {
        // Do not suppress the throwing behavior - this 'error' event will be caught by system if not handled by duplex
        if (!ignoreStreamError) this.emit('error', err);
      }
    }

    this.on('error', duplexOnError);

    // Socket.IO Lifecycle
    this.onDisconnect = options.onDisconnect || (() => {
      if (!this.destroyed) this._cleanup();
    });

    this.onTargetDisconnect = options.onTargetDisconnect || (([targetClientId]) => {
      if (this.targetClientId === targetClientId && !this.destroyed) this._cleanup();
    });

    this.onTargetStreamDestroyed = options.onTargetStreamDestroyed || (([targetStreamId]) => {
      if (this.targetStreamId === targetStreamId && !this.destroyed) this._cleanup();
    });

    // Socket.IO events
    this.onReceiveStreamData = (data, callbackFn) => {
      let [chunk] = data;

      if (chunk === null) {
        this.emit('end');
        callbackFn();
      } else {
        if (Array.isArray(chunk) || typeof chunk === 'string') chunk = Buffer.from(chunk);

        if (!this.push(chunk)) { // if reach highWaterMark -> signal the other client to pause writing
          this.writeCallbackFn = callbackFn;
        } else {
          callbackFn();
        }
      }
    };

    this.removeSocketListeners = () => {
      this.coreApi.ee.off(P2P_EMIT_STREAM + STREAM_IDENTIFIER_PREFIX + this.targetStreamId, this.onReceiveStreamData);
      this.coreApi.ee.off(PEER_STREAM_DESTROYED, this.onTargetStreamDestroyed);
      this.coreApi.ee.off(TARGET_DISCONNECT, this.onTargetDisconnect);

      const socket = this.coreApi.getSocketByClientId(this.targetClientId);
      if (socket) socket.off('disconnect', this.onDisconnect);
    }

    this.addSocketListeners = () => {
      this.coreApi.ee.on(P2P_EMIT_STREAM + STREAM_IDENTIFIER_PREFIX + this.targetStreamId, this.onReceiveStreamData);
      this.coreApi.ee.on(PEER_STREAM_DESTROYED, this.onTargetStreamDestroyed);
      this.coreApi.ee.on(TARGET_DISCONNECT, this.onTargetDisconnect);

      const socket = this.coreApi.getSocketByClientId(this.targetClientId);
      if (socket) socket.once('disconnect', this.onDisconnect);
    }

    this.addSocketListeners();
  }

  // Writable stream handlers & events
  _write(chunk, encoding, callback) {
    const eventName = P2P_EMIT_STREAM + STREAM_IDENTIFIER_PREFIX + this.sourceStreamId;
    this.coreApi.emitTo(this.targetClientId, eventName, chunk, callback);
  };

  // Readable stream handlers & events
  _read() {
    if (typeof this.writeCallbackFn === 'function') this.writeCallbackFn();
  };

  _destroy() {
    const targetClientSocket = this.coreApi.getSocketByClientId(this.targetClientId);
    if (targetClientSocket) this.coreApi.emitTo(this.targetClientId, PEER_STREAM_DESTROYED, this.sourceStreamId);

    this.removeSocketListeners();
    this.emit('close');
    this.coreApi.virtualClients.delete(this.sourceClientId);
  };

  end(...args) {
    const [chunk, encoding, callback] = args;

    const sendNullChunk = () => {
      this._write(null, encoding, () => {
        if (typeof callback === 'function') callback();
        super.end();
      });
    }

    if (args.length) {
      this._write(chunk, encoding, () => sendNullChunk());
    } else {
      sendNullChunk();
    }
  }

  /*
    This is to avoid write after destroyed error
    Sometimes if p2p stream is destroyed immediately, other streams can still try to write to p2p stream,
    causing ERR_STREAM_DESTROYED error
   */
  _cleanup() {
    this.coreApi.virtualClients.delete(this.sourceClientId);
    if (!this.destroyed) this.destroy();
  }
}

module.exports = P2pServerStreamApi;
