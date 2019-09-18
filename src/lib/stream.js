const {Duplex} = require('stream');
const {SOCKET_EVENT} = require('../util/constants');

module.exports.createClientStream = function (p2pClientPlugin, options) {
  let writeCallbackFn;

  const duplex = new Duplex({
    ...options,
  });

  // Lifecycle handlers & events
  duplex.on('end', duplexOnEnd);
  duplex.on('error', duplexOnError);

  function duplexOnEnd() {
    if (!duplex.destroyed && duplex._writableState.finished) {
      duplex.destroy();
    }
  }

  function duplexOnError(err) {
    duplex.removeListener('error', duplexOnError);
    duplex.destroy();
    if (duplex.listenerCount('error') === 0) {
      // Do not suppress the throwing behavior.
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
      if (writeCallbackFn && typeof writeCallbackFn === 'function') writeCallbackFn();
      // data has been consumed -> signal the other client to resume writing
    }
  };

  // Socket.IO events
  p2pClientPlugin.on(SOCKET_EVENT.P2P_EMIT_STREAM, (chunk, callbackFn) => {
    if (!duplex.push(chunk)) { // if reach highWaterMark -> signal the other client to pause writing
      writeCallbackFn = callbackFn;
    } else {
      callbackFn();
    }
  });

  p2pClientPlugin.once('disconnect', () => {
    if (duplex.destroyed) return;
    duplex.push(null);
  });

  return duplex;
}
