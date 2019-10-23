const {Duplex} = require('stream');
const {SOCKET_EVENT} = require('../../util/constants');
const uuidv1 = require('uuid/v1');
const _ = require('lodash');

class P2pMultiStreamApi {
  constructor(socket, p2pMultiMessageApi) {
    this.socket = socket;
    this.p2pMultiMessageApi = p2pMultiMessageApi;
    this.clientId = p2pMultiMessageApi.clientId;
    // todo: add test
    this.listenerMap = {};

    // returns false if client haven't listened on the event -> notify peer that this client is not ready
    this.socket.on(SOCKET_EVENT.MULTI_API_CREATE_STREAM, (connectionInfo, serverCallback) => serverCallback(false));
  }

  addP2pStream(targetClientId, duplexOptions, successCallback, failureCallback) {
    const {sourceStreamId, targetStreamId, ...duplexOpts} = duplexOptions;

    const connectionInfo = {
      sourceStreamId: sourceStreamId || uuidv1(),
      targetStreamId: targetStreamId || uuidv1(),
      // sourceClientId will be set on server
      targetClientId: targetClientId,
    };

    if (successCallback || failureCallback) {
      this.socket.emit(SOCKET_EVENT.MULTI_API_CREATE_STREAM, connectionInfo, success => {
        if (success) {
          const duplex = this.createClientStream(connectionInfo, this.socket, this.p2pMultiMessageApi, duplexOpts);
          if (successCallback) successCallback(duplex);
        } else {
          if (failureCallback) failureCallback();
        }
      });
    } else {
      return new Promise(resolve => {
        this.socket.emit(SOCKET_EVENT.MULTI_API_CREATE_STREAM, connectionInfo, success => {
          if (success) {
            const duplex = this.createClientStream(connectionInfo, this.socket, this.p2pMultiMessageApi, duplexOpts);
            resolve(duplex);
          } else {
            resolve(null);
          }
        });
      });
    }
  }

  onAddP2pStream(duplexOptions, clientCallback) {
    this.offAddP2pStream();
    this.socket.on(SOCKET_EVENT.MULTI_API_CREATE_STREAM, (connectionInfo, serverCallback) => {
      const newConnectionInfo = _.clone(connectionInfo);
      [newConnectionInfo.sourceClientId, newConnectionInfo.targetClientId] = [newConnectionInfo.targetClientId, newConnectionInfo.sourceClientId];
      [newConnectionInfo.sourceStreamId, newConnectionInfo.targetStreamId] = [newConnectionInfo.targetStreamId, newConnectionInfo.sourceStreamId];

      const duplex = this.createClientStream(newConnectionInfo, this.socket, this.p2pMultiMessageApi, duplexOptions);
      if (clientCallback) clientCallback(duplex); // return a Duplex to the calling client
      if (serverCallback) serverCallback(true); // return result to peer to create stream on the other end of the connection
    });
  }

  offAddP2pStream() {
    this.socket.off(SOCKET_EVENT.MULTI_API_CREATE_STREAM);
  }

  // todo: add test
  fromStream(targetClientId, targetStreamId) {
    this.currentTargetClientId = targetClientId;
    this.currentStreamId = targetStreamId;
    return this;
  }

  // todo: add test
  on(event, callback) {
    const streamId = this.currentStreamId;
    const eventName = `${event}${SOCKET_EVENT.STREAM_IDENTIFIER_PREFIX}${streamId}`; // format: event-from-stream-stream123-from-client-abc123
    this.p2pMultiMessageApi.from(this.currentTargetClientId).on(eventName, callback);

    this.listenerMap[streamId] = this.listenerMap[streamId] || [];
    this.listenerMap[streamId].push(eventName);
  }

  // todo: add test
  once(event, callback) {
    const streamId = this.currentStreamId;
    const eventName = `${event}${SOCKET_EVENT.STREAM_IDENTIFIER_PREFIX}${streamId}`; // format: event-from-stream-stream123-from-client-abc123
    this.p2pMultiMessageApi.from(this.currentTargetClientId).once(eventName, callback);

    this.listenerMap[streamId] = this.listenerMap[streamId] || [];
    this.listenerMap[streamId].push(eventName);
  }

  // todo: add test
  off(event, callback) {
    const streamId = this.currentStreamId;
    const eventName = `${event}${SOCKET_EVENT.STREAM_IDENTIFIER_PREFIX}${streamId}`;

    if (callback) this.p2pMultiMessageApi.from(this.currentTargetClientId).off(eventName, callback);
    else this.p2pMultiMessageApi.from(this.currentTargetClientId).off(eventName);
  }

  // todo: add test
  offStreamListeners(targetStreamId) {
    if (this.listenerMap[targetStreamId]) {
      this.listenerMap[targetStreamId].forEach(eventName => this.socket.removeAllListeners(eventName));
      delete this.listenerMap[targetStreamId];
    }
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

    // todo: add test
    const onTargetStreamDestroyed = targetStreamId => {
      if (duplex.targetStreamId === targetStreamId) {
        if (!duplex.destroyed) duplex.destroy();
      }
    }

    function addSocketListeners() {
      const emitEvent = `${SOCKET_EVENT.P2P_EMIT_STREAM}${SOCKET_EVENT.STREAM_IDENTIFIER_PREFIX}${targetStreamId}`;
      p2pMultiMessageApi.from(targetClientId).on(emitEvent, onReceiveStreamData);
      p2pMultiMessageApi.from(targetClientId).on(SOCKET_EVENT.PEER_STREAM_DESTROYED, onTargetStreamDestroyed); // todo: add test
      socket.once('disconnect', onDisconnect);
      socket.on(SOCKET_EVENT.MULTI_API_TARGET_DISCONNECT, onTargetDisconnect);
    }

    function removeSocketListeners() {
      const emitEvent = `${SOCKET_EVENT.P2P_EMIT_STREAM}${SOCKET_EVENT.STREAM_IDENTIFIER_PREFIX}${targetStreamId}`;
      p2pMultiMessageApi.from(targetClientId).off(emitEvent);
      p2pMultiMessageApi.from(targetClientId).off(SOCKET_EVENT.PEER_STREAM_DESTROYED, onTargetStreamDestroyed); // todo: add test
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
      this.offStreamListeners(targetStreamId); // todo: add test
      p2pMultiMessageApi.emitTo(targetClientId, SOCKET_EVENT.PEER_STREAM_DESTROYED, sourceStreamId); // todo: add test
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

module.exports = P2pMultiStreamApi;
