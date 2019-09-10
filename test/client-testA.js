const sourceDeviceId = 'A';
const p2pClientPlugin = require("../src/p2pClientPlugin");
const socketClient = require('socket.io-client');
const ioRaw = socketClient.connect(`http://localhost:9000?deviceId=${sourceDeviceId}`);
const io = p2pClientPlugin(ioRaw);

try {
  io.registerP2pTarget('B', {}, () => {
    // io.emit2('testEvent', {a: 1}, 'b', 2, {c: 3});

    io.emit2('testAck', {a: 1}, 'b', 2, {c: 3}, function (result) {
      console.log(result);
    });

    // setTimeout(() => {
    //   io.unregisterP2pTarget();
    // }, 2000);
  });
} catch (e) {
  // handle error if connection can't be made (device is busy, device is offline, ...)
  console.error(e);
}

io.on('testAckFromTarget', function () {
  console.log(arguments);
});
