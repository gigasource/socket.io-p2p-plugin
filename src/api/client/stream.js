const {Duplex} = require('stream');
const {SOCKET_EVENT} = require('../../util/constants');
const uuidv1 = require('uuid/v1');

class P2pClientStreamApi {
  constructor(socket, p2pMultiMessageApi) {
    this.socket = socket;
    this.p2pMultiMessageApi = p2pMultiMessageApi;
    this.clientId = p2pMultiMessageApi.clientId;

    // returns false if client haven't listened on the event -> notify peer that this client is not ready
    this.socket.on(SOCKET_EVENT.MULTI_API_CREATE_STREAM, (connectionInfo, serverCallback) => {
      serverCallback(new Error('Client is not listening to create stream event'));
    });
  }

  addP2pStream(targetClientId, duplexOptions, callback) {
    const {sourceStreamId, targetStreamId, ...duplexOpts} = duplexOptions;

    const connectionInfo = {
      sourceStreamId: sourceStreamId || uuidv1(),
      targetStreamId: targetStreamId || uuidv1(),
      // sourceClientId will be set on server
      targetClientId: targetClientId,
    };

    if (callback) {
      this.socket.emit(SOCKET_EVENT.MULTI_API_CREATE_STREAM, connectionInfo, (err) => {
        if (err) {
          callback(new Error('Client is not listening to create stream event'));
          return;
        }

        const duplex = this.createClientStream(connectionInfo, this.socket, this.p2pMultiMessageApi, duplexOpts);
        callback(duplex);
      });
    } else {
      return new Promise((resolve, reject) => {
        this.socket.emit(SOCKET_EVENT.MULTI_API_CREATE_STREAM, connectionInfo, (err) => {
          if (err) return reject(new Error('Client is not listening to create stream event'));

          const duplex = this.createClientStream(connectionInfo, this.socket, this.p2pMultiMessageApi, duplexOpts);
          resolve(duplex);
        });
      });
    }
  }

  onAddP2pStream(duplexOptions, clientCallback) {
    this.offAddP2pStream();
    this.socket.on(SOCKET_EVENT.MULTI_API_CREATE_STREAM, (connectionInfo, serverCallback) => {
      [connectionInfo.sourceClientId, connectionInfo.targetClientId] = [connectionInfo.targetClientId, connectionInfo.sourceClientId];
      [connectionInfo.sourceStreamId, connectionInfo.targetStreamId] = [connectionInfo.targetStreamId, connectionInfo.sourceStreamId];

      const duplex = this.createClientStream(connectionInfo, this.socket, this.p2pMultiMessageApi, duplexOptions);
      if (clientCallback) clientCallback(duplex); // return a Duplex to the calling client
      if (serverCallback) serverCallback(); // return result to peer to create stream on the other end of the connection
    });
  }

  offAddP2pStream() {
    this.socket.off(SOCKET_EVENT.MULTI_API_CREATE_STREAM);
  }

  createClientStream(connectionInfo, socket, p2pMultiMessageApi, options) {
    const {sourceStreamId, targetStreamId, targetClientId} = connectionInfo;
    let writeCallbackFn;
    let duplex = new Duplex({
      ...options,
    });
    duplex.sourceStreamId = sourceStreamId;
    duplex.targetStreamId = targetStreamId;
    duplex.targetClientId = targetClientId;

    // Socket.IO Lifecycle
    const onDisconnect = () => {
      if (!duplex.destroyed) duplex.destroy();
    }

    const onTargetDisconnect = targetClientId => {
      if (duplex.targetClientId === targetClientId) {
        if (!duplex.destroyed) duplex.destroy();
      }
    }

    const onTargetStreamDestroyed = targetStreamId => {
      if (duplex.targetStreamId === targetStreamId) {
        if (!duplex.destroyed) duplex.destroy();
      }
    }

    function addSocketListeners() {
      const emitEvent = `${SOCKET_EVENT.P2P_EMIT_STREAM}${SOCKET_EVENT.STREAM_IDENTIFIER_PREFIX}${targetStreamId}`;
      p2pMultiMessageApi.from(targetClientId).on(emitEvent, onReceiveStreamData);
      p2pMultiMessageApi.from(targetClientId).on(SOCKET_EVENT.PEER_STREAM_DESTROYED, onTargetStreamDestroyed);
      socket.once('disconnect', onDisconnect);
      socket.on(SOCKET_EVENT.MULTI_API_TARGET_DISCONNECT, onTargetDisconnect);
    }

    function removeSocketListeners() {
      const emitEvent = `${SOCKET_EVENT.P2P_EMIT_STREAM}${SOCKET_EVENT.STREAM_IDENTIFIER_PREFIX}${targetStreamId}`;
      p2pMultiMessageApi.from(targetClientId).off(emitEvent);
      p2pMultiMessageApi.from(targetClientId).off(SOCKET_EVENT.PEER_STREAM_DESTROYED, onTargetStreamDestroyed);
      socket.off('disconnect', onDisconnect);
      socket.off(SOCKET_EVENT.MULTI_API_TARGET_DISCONNECT, onTargetDisconnect);
    }

    addSocketListeners();

    // Lifecycle handlers & events
    duplex.on('error', duplexOnError);

    function duplexOnError(err) {
      if (err) console.error(`Error thrown by duplex stream: ${err.message}, stream will be destroyed`);
      duplex.removeListener('error', duplexOnError);
      duplex.destroy();
      if (duplex.listenerCount('error') === 0) {
        // Do not suppress the throwing behavior - this 'error' event will be caught by system if not handled by duplex
        duplex.emit('error', err);
      }
    }

    // Writable stream handlers & events
    duplex._write = function (chunk, encoding, callback) {
      const eventName = `${SOCKET_EVENT.P2P_EMIT_STREAM}${SOCKET_EVENT.STREAM_IDENTIFIER_PREFIX}${sourceStreamId}`;
      p2pMultiMessageApi.emitTo(targetClientId, eventName, chunk, callback);
    };

    // Readable stream handlers & events
    duplex._read = function () {
      if (typeof writeCallbackFn === 'function') writeCallbackFn();
    };

    duplex._destroy = () => {
      removeSocketListeners();
      p2pMultiMessageApi.emitTo(targetClientId, SOCKET_EVENT.PEER_STREAM_DESTROYED, sourceStreamId);
    };

    // Socket.IO events
    function onReceiveStreamData(chunk, callbackFn) {
      if (chunk instanceof Array) chunk = Buffer.from(chunk);

      if (!duplex.push(chunk)) { // if reach highWaterMark -> signal the other client to pause writing
        writeCallbackFn = callbackFn;
      } else {
        callbackFn();
      }
    }

    return duplex;
  }
}

module.exports = P2pClientStreamApi;
