const sourceDeviceId = 'A';
const p2pClientPlugin = require("../src/p2pClientPlugin");
const socketClient = require('socket.io-client');
const ioRaw = socketClient.connect(`http://localhost:9000?deviceId=${sourceDeviceId}`);
const io = p2pClientPlugin(ioRaw);

io.registerP2pTarget('B', {});

setTimeout(function () {
  // io.emit2('testEvent', {a: 1}, 'b', 2, {c: 3});
  io.emit2('testAck', {a: 1}, 'b', 2, {c: 3}, function (result) {
    console.log(result);
  });

  // setTimeout(() => {
  //   io.unregisterP2pTarget();
  // }, 2000);
}, 5000);

io.on('testAckFromTarget', function () {
  console.log(arguments);
});
