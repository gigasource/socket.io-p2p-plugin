const {Duplex} = require('stream');
const {
  SOCKET_EVENT: {CREATE_STREAM, P2P_EMIT_STREAM, STREAM_IDENTIFIER_PREFIX, PEER_STREAM_DESTROYED, TARGET_DISCONNECT},
  MISC_CONFIG: {INIT_STREAM_TIMEOUT},
} = require('../../util/constants');
const uuidv1 = require('uuid/v1');

class P2pClientStreamApi {
  constructor(socket, p2pMultiMessageApi) {
    this.socket = socket;
    this.p2pClientMessageApi = p2pMultiMessageApi;
    this.clientId = p2pMultiMessageApi.clientId;
  }

  addP2pStream(targetClientId, channelOrArgArrayOrCallback, duplexOptions, callback) {
    let channel;
    let argArray;

    if (typeof channelOrArgArrayOrCallback === 'string') {
      // addP2pStream('clientId', 'channel', {}, () => {});
      channel = channelOrArgArrayOrCallback;
    } else if (Array.isArray(channelOrArgArrayOrCallback)) {
      // addP2pStream('clientId', [1, 2, 3], {}, () => {});
      argArray = channelOrArgArrayOrCallback;
    } else if (typeof channelOrArgArrayOrCallback === 'function') {
      // addP2pStream('clientId', () => {});
      callback = channelOrArgArrayOrCallback;
      duplexOptions = {};
    } else {
      // backward compatibility
      // addP2pStream('clientId', {}, () => {});
      callback = duplexOptions;
      duplexOptions = channelOrArgArrayOrCallback;
    }

    const {sourceStreamId, targetStreamId, ...duplexOpts} = duplexOptions || {};

    const connectionInfo = {
      sourceStreamId: sourceStreamId || uuidv1(),
      targetStreamId: targetStreamId || uuidv1(),
      // sourceClientId will be set on server
      targetClientId: targetClientId,
      ...channel && {channel},
      ...argArray && {argArray},
    };

    if (callback) {
      this.socket.emit(CREATE_STREAM, connectionInfo, (err) => {
        if (err) return callback(err);

        const duplex = this.createClientStream(connectionInfo, duplexOpts);
        callback(duplex);
      });
    } else {
      return new Promise((resolve, reject) => {
        const timeout = duplexOpts.initStreamTimeout || INIT_STREAM_TIMEOUT;
        const cancelTimeout = setTimeout(() =>
                reject(`addP2pStream error: target client response timeout (${timeout}ms) exceeded`),
            timeout);

        this.socket.emit(CREATE_STREAM, connectionInfo, (err) => {
          clearTimeout(cancelTimeout);
          if (err) return reject(err);

          const duplex = this.createClientStream(connectionInfo, duplexOpts);
          resolve(duplex);
        });
      });
    }
  }

  onAddP2pStream(channelOrDuplexOptions, clientCallback, duplexOptions) {
    let channel;

    if (typeof channelOrDuplexOptions === 'string') {
      // onAddP2pStream('channel', (duplex) => {}, {})
      duplexOptions = duplexOptions || {};
      channel = channelOrDuplexOptions;
    } else if (typeof channelOrDuplexOptions === 'function') {
      // onAddP2pStream((duplex) => {}, {}) or onAddP2pStream((duplex) => {})
      duplexOptions = clientCallback || {};
      clientCallback = channelOrDuplexOptions;
    } else if (typeof channelOrDuplexOptions === 'object' && typeof clientCallback === 'function') {
      // backward compatibility
      // onAddP2pStream({}, (duplex) => {})
      duplexOptions = channelOrDuplexOptions;
    } else {
      if (arguments.length > 0) throw new Error('Invalid usage of parameters');
    }

    let event = CREATE_STREAM;
    if (channel) event += `-CHANNEL-${channel}`;

    this.offAddP2pStream(channel);

    this.socket.on(event, (connectionInfo, serverCallback) => {
      [connectionInfo.sourceClientId, connectionInfo.targetClientId] = [connectionInfo.targetClientId, connectionInfo.sourceClientId];
      [connectionInfo.sourceStreamId, connectionInfo.targetStreamId] = [connectionInfo.targetStreamId, connectionInfo.sourceStreamId];

      const duplex = this.createClientStream(connectionInfo, duplexOptions);

      if (clientCallback) {
        // return a Duplex to the calling client
        if (Array.isArray(connectionInfo.argArray)) clientCallback(duplex, connectionInfo.argArray);
        else clientCallback(duplex);
      }

      if (serverCallback) serverCallback(); // return result to peer to create stream on the other end of the connection
    });
  }

  offAddP2pStream(channel) {
    let event = CREATE_STREAM;
    if (channel) event += `-CHANNEL-${channel}`;
    this.socket.off(event);
  }

  createClientStream(connectionInfo, options = {}) {
    if (options.onDisconnect && typeof options.onDisconnect !== 'function')
      throw new Error('onDisconnect option must be function');
    if (options.onTargetDisconnect && typeof options.onTargetDisconnect !== 'function')
      throw new Error('onTargetDisconnect option must be function');
    if (options.onTargetStreamDestroyed && typeof options.onTargetStreamDestroyed !== 'function')
      throw new Error('onTargetStreamDestroyed option must be function');

    const {ignoreStreamError, ...opts} = options

    const {sourceStreamId, targetStreamId, targetClientId} = connectionInfo;
    let writeCallbackFn;
    let duplex = new Duplex(opts);
    duplex.sourceStreamId = sourceStreamId;
    duplex.targetStreamId = targetStreamId;
    duplex.targetClientId = targetClientId;

    // Socket.IO Lifecycle
    const onDisconnect = options.onDisconnect || function () {
      if (!duplex.destroyed) duplex.cleanup(5000);
    };

    const onTargetDisconnect = options.onTargetDisconnect || function (targetClientId) {
      if (duplex.targetClientId === targetClientId && !duplex.destroyed) duplex.cleanup(5000);
    }

    const onTargetStreamDestroyed = options.onTargetStreamDestroyed || function (targetStreamId) {
      if (duplex.targetStreamId === targetStreamId && !duplex.destroyed) duplex.cleanup(5000);
    }

    // Socket.IO events
    const onReceiveStreamData = (chunk, callbackFn) => {
      if (chunk instanceof Array) chunk = Buffer.from(chunk);

      if (!duplex.push(chunk)) { // if reach highWaterMark -> signal the other client to pause writing
        writeCallbackFn = callbackFn;
      } else {
        callbackFn();
      }
    }

    const addSocketListeners = () => {
      this.socket.on(P2P_EMIT_STREAM + STREAM_IDENTIFIER_PREFIX + targetStreamId, onReceiveStreamData);
      this.socket.on(PEER_STREAM_DESTROYED, onTargetStreamDestroyed);
      this.socket.once('disconnect', onDisconnect);
      this.socket.on(TARGET_DISCONNECT, onTargetDisconnect);
    }

    const removeSocketListeners = () => {
      this.socket.off(P2P_EMIT_STREAM + STREAM_IDENTIFIER_PREFIX + targetStreamId);
      this.socket.off(PEER_STREAM_DESTROYED, onTargetStreamDestroyed);
      this.socket.off('disconnect', onDisconnect);
      this.socket.off(TARGET_DISCONNECT, onTargetDisconnect);
    }

    addSocketListeners();

    // Lifecycle handlers & events
    const duplexOnError = (err) => {
      if (err) console.error(`Error thrown by duplex stream: ${err.message}, stream will be destroyed`);
      duplex.removeListener('error', duplexOnError);
      duplex.destroy();
      if (duplex.listenerCount('error') === 0) {
        // Do not suppress the throwing behavior - this 'error' event will be caught by system if not handled by duplex
        if (!ignoreStreamError) duplex.emit('error', err);
      }
    }

    duplex.on('error', duplexOnError);

    // Writable stream handlers & events
    duplex._write = (chunk, encoding, callback) => {
      const eventName = P2P_EMIT_STREAM + STREAM_IDENTIFIER_PREFIX + sourceStreamId;
      this.p2pClientMessageApi.emitTo(targetClientId, eventName, chunk, callback);
    };

    // Readable stream handlers & events
    duplex._read = () => {
      if (typeof writeCallbackFn === 'function') writeCallbackFn();
    };

    duplex._destroy = () => {
      removeSocketListeners();
      duplex.emit('close');
      this.p2pClientMessageApi.emitTo(targetClientId, PEER_STREAM_DESTROYED, sourceStreamId);
    };

    /*
      This is to avoid write after destroyed error
      Sometimes if p2p stream is destroyed immediately, other streams can still try to write to p2p stream,
      causing ERR_STREAM_DESTROYED error
     */
    duplex.cleanup = timeout => {
      // The timeout is to make sure if 'finish' event is not called (no data left to write), stream will still be destroyed
      let destroyTimeout;

      if (timeout) {
        if (typeof timeout !== 'number') throw new Error('timeout must be a number');
        destroyTimeout = setTimeout(() => !duplex.destroyed && duplex.destroy(), timeout);
      }

      duplex.once('finish', () => {
        if (!duplex.destroyed) duplex.destroy();
        if (destroyTimeout) clearTimeout(destroyTimeout);
      });

      duplex.end();
    }

    return duplex;
  }
}

module.exports = P2pClientStreamApi;
