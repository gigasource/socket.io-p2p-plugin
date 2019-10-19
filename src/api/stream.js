const {Duplex} = require('stream');
const {SOCKET_EVENT} = require('../util/constants');
const uuidv1 = require('uuid/v1');

class P2pStreamApi {
  constructor(socket, p2pMessageApi) {
    this.socket = socket;
    this.p2pMessageApi = p2pMessageApi;
    this.clientId = p2pMessageApi.clientId;

    // returns false if client haven't listened on the event -> notify peer that this client is not ready
    this.socket.on(SOCKET_EVENT.P2P_REGISTER_STREAM, serverCallback => serverCallback(false));
  }

  registerP2pStream(targetClientId, duplexOptions, successCallback, failureCallback) {
    if (!this.clientId) throw new Error('registerP2pStream can only be called after registerP2pTarget');

    const streamIds = {
      sourceStreamId: uuidv1(),
      targetStreamId: uuidv1(),
    };

    if (successCallback || failureCallback) {
      this.socket.emit(SOCKET_EVENT.P2P_REGISTER_STREAM, targetClientId, streamIds, success => {
        if (success) {
          const duplex = createClientStream(streamIds.sourceStreamId, streamIds.targetStreamId, this.socket, this.p2pMessageApi, duplexOptions);
          if (successCallback) successCallback(duplex);
        } else {
          if (failureCallback) failureCallback();
        }
      });
    } else {
      return new Promise(resolve => {
        this.socket.emit(SOCKET_EVENT.P2P_REGISTER_STREAM, targetClientId, streamIds, success => {
          if (success) {
            const duplex = createClientStream(streamIds.sourceStreamId, streamIds.targetStreamId, this.socket, this.p2pMessageApi, duplexOptions);
            resolve(duplex);
          } else {
            resolve(null);
          }
        });
      });
    }
  }

  onRegisterP2pStream(duplexOptions, clientCallback) {
    this.offRegisterP2pStream();
    this.socket.on(SOCKET_EVENT.P2P_REGISTER_STREAM, ({sourceStreamId, targetStreamId}, serverCallback) => {
      const duplex = createClientStream(targetStreamId, sourceStreamId, this.socket, this.p2pMessageApi, duplexOptions);
      if (clientCallback) clientCallback(duplex); // return a Duplex to the calling client
      if (serverCallback) serverCallback(true); // return result to peer to create stream on the other end of the connection
    });
  }

  offRegisterP2pStream() {
    this.socket.off(SOCKET_EVENT.P2P_REGISTER_STREAM);
  }
}

function createClientStream(sourceStreamId, targetStreamId, socket, p2pMessageApi, options) {
  let writeCallbackFn;
  let duplex = new Duplex({
    ...options,
  });
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
    p2pMessageApi.emit2(`${SOCKET_EVENT.P2P_EMIT_STREAM}-from-stream-${sourceStreamId}`, chunk, callback);
  };

  // Readable stream handlers & events
  duplex._read = function () {
    if (typeof writeCallbackFn === 'function') writeCallbackFn();
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

  function onDisconnect() {
    if (!duplex.destroyed) duplex.destroy();
    removeSocketListeners();
  }

  function addSocketListeners() {
    socket.on(`${SOCKET_EVENT.P2P_EMIT_STREAM}-from-stream-${targetStreamId}`, onReceiveStreamData);
    socket.once('disconnect', onDisconnect);
    socket.once(SOCKET_EVENT.P2P_DISCONNECT, onDisconnect);
    socket.once(SOCKET_EVENT.P2P_UNREGISTER, onDisconnect);
  }

  function removeSocketListeners() {
    socket.off(`${SOCKET_EVENT.P2P_EMIT_STREAM}-from-stream-${targetStreamId}`, onReceiveStreamData);
    socket.off('disconnect', onDisconnect);
    socket.off(SOCKET_EVENT.P2P_DISCONNECT, onDisconnect);
    socket.off(SOCKET_EVENT.P2P_UNREGISTER, onDisconnect);
  }

  return duplex;
}

module.exports = P2pStreamApi;
