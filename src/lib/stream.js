const {Duplex} = require('stream');
const {SOCKET_EVENT} = require('../util/constants');
const {StringDecoder} = require('string_decoder');

function emitClose(stream) {
  stream.emit('close');
}

module.exports.createClientStream = function (p2pClientPlugin, options) {
  let needDrain = false;
  let targetHighWaterMarkReached = false;
  const decoder = new StringDecoder('utf8');

  // function receiverOnDrain() {
  //   if (resumeOnReceiverDrain) ws._socket.resume();
  // }
  //
  // if (!p2pClientPlugin.targetClientId) {
  //   p2pClientPlugin.once('connect', () => {
  //     ws._receiver.removeAllListeners('drain');
  //     ws._receiver.on('drain', receiverOnDrain);
  //   });
  // } else {
  //   ws._receiver.removeAllListeners('drain');
  //   ws._receiver.on('drain', receiverOnDrain);
  // }

  const duplex = new Duplex({
    ...options,
    autoDestroy: false,
    emitClose: false,
    objectMode: false,
    readableObjectMode: false,
    writableObjectMode: false
  });
  let current;
  p2pClientPlugin.on(SOCKET_EVENT.P2P_EMIT_STREAM, (chunk, callbackFn) => {
    const str = decoder.write(chunk);
    if (!duplex.push(chunk)) {
      // resumeOnReceiverDrain = false;
      p2pClientPlugin.emit(SOCKET_EVENT.TARGET_HIGH_WATERMARK_REACHED);
    }
    callbackFn();
  });

  p2pClientPlugin.on(SOCKET_EVENT.TARGET_HIGH_WATERMARK_REACHED, () => {
    targetHighWaterMarkReached = true;
  })

  duplex.on('drain', () => {
    console.log('on drain');
  });

  duplex.on('resume', () => {
    console.log('on resume');
  });

  // ws.once('error', function error(err) {
  //   duplex.destroy(err);
  // });

  //TODO: once or on?????
  p2pClientPlugin.once('disconnect', () => {
    if (duplex.destroyed) return;
    duplex.push(null);
  });

  duplex._destroy = function (err, callback) {
    if (!p2pClientPlugin.targetClientId) {
      callback(err);
      process.nextTick(emitClose, duplex);
      // return;
    }

    // ws.once('close', function close() {
    //   callback(err);
    //   process.nextTick(emitClose, duplex);
    // });
    // ws.terminate();
  };


  //
  //   ws.once('close', function close() {
  //     callback(err);
  //     process.nextTick(emitClose, duplex);
  //   });
  //   ws.terminate();
  // };
  //
  duplex._final = function (callback) {
    if (!p2pClientPlugin.targetClientId) {
      p2pClientPlugin.once('connect', function open() {
        duplex._final(callback);
      });
      return;
    }
    duplex.destroy();
    callback();
    process.nextTick(emitClose, duplex);
  };

  duplex._read = function () {
    const a = duplex;
    // if (p2pClientPlugin.targetClientId && !resumeOnReceiverDrain) {
    // resumeOnReceiverDrain = true;
    // if (!ws._receiver._writableState.needDrain) ws._socket.resume();
    // }
  };

  duplex._write = function (chunk, encoding, callback) {
    console.log('write: ' + decoder.write(chunk));
    current = decoder.write(chunk);
    // if (!p2pClientPlugin.targetClientId) {
    //   //TODO: once or on???
    //   p2pClientPlugin.once('connect', function open() {
    //     duplex._write(chunk, encoding, callback);
    //   });
    //   return;
    // }

    // else if (targetNeedDrain) {
    //   duplex.once('drain', () => {
    //     tar
    //     duplex._write(chunk, encoding, callback);
    //   });
    //   return;
    // }

    // p2pClientPlugin.emit2(SOCKET_EVENT.P2P_EMIT_STREAM, chunk, targetClientNeedDrain => targetNeedDrain = targetClientNeedDrain);
    p2pClientPlugin.emit2(SOCKET_EVENT.P2P_EMIT_STREAM, chunk, callback);
  };

  // duplex.on('end', duplexOnEnd);
  // duplex.on('error', duplexOnError);
  return duplex;
}
