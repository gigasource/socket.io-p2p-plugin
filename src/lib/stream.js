const {Duplex} = require('stream');
const {SOCKET_EVENT} = require('../util/constants');

module.exports.createClientStream = function (p2pClientPlugin, options) {
  let writeCallbackFn;

  let duplex = new Duplex({
    ...options,
  });

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
    if (!p2pClientPlugin.targetClientId) {
      p2pClientPlugin.once(SOCKET_EVENT.P2P_REGISTER_SUCCESS, function open() {
        duplex._write(chunk, encoding, callback);
      });
      return;
    }

    p2pClientPlugin.emit2(SOCKET_EVENT.P2P_EMIT_STREAM, chunk, callback);
  };

  // Readable stream handlers & events
  duplex._read = function () {
    if (p2pClientPlugin.targetClientId) {
      if (typeof writeCallbackFn === 'function') writeCallbackFn();
      // data has been consumed -> signal the other client to resume writing
    }
  };

  // Socket.IO events
  function onReceiveStreamData(chunk, callbackFn) {
    if (!duplex.push(chunk)) { // if reach highWaterMark -> signal the other client to pause writing
      writeCallbackFn = callbackFn;
    } else {
      callbackFn();
    }
  }

  function destroyDuplex() {
    if (!duplex.destroyed) duplex.destroy();
    removeSocketListeners();
  }

  function removeSocketListeners() {
    p2pClientPlugin.off(SOCKET_EVENT.P2P_EMIT_STREAM, onReceiveStreamData);
    p2pClientPlugin.off('disconnect', destroyDuplex);
    p2pClientPlugin.off(SOCKET_EVENT.P2P_DISCONNECT, destroyDuplex);
    p2pClientPlugin.off(SOCKET_EVENT.P2P_UNREGISTER, destroyDuplex);
  }

  p2pClientPlugin.on(SOCKET_EVENT.P2P_EMIT_STREAM, onReceiveStreamData);

  p2pClientPlugin.once('disconnect', destroyDuplex);
  p2pClientPlugin.once(SOCKET_EVENT.P2P_DISCONNECT, destroyDuplex);
  p2pClientPlugin.once(SOCKET_EVENT.P2P_UNREGISTER, destroyDuplex);

  return duplex;
}
