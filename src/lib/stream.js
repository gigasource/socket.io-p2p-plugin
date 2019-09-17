const {Duplex} = require('stream');
const {SOCKET_EVENT} = require('../util/constants');
const {StringDecoder} = require('string_decoder');
const decoder = new StringDecoder('utf8');

function emitClose(stream) {
  stream.emit('close');
}

module.exports.createClientStream = function (p2pClientPlugin, options) {
  let writeCallbackFn;

  const duplex = new Duplex({
    ...options,
    emitClose: false,
  });

  // Lifecycle handlers & events
  duplex._final = function (callback) {
    if (!p2pClientPlugin.targetClientId) {
      p2pClientPlugin.once('connect', () => {
        duplex._final(callback);
      });
      return;
    }
    duplex.destroy();
    callback();
    process.nextTick(emitClose, duplex);
  };

  duplex._destroy = function (err, callback) {
    if (!p2pClientPlugin.targetClientId) {
      callback(err);
      process.nextTick(emitClose, duplex);
    }
  };

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
