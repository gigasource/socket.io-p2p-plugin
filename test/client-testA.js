const sourceDeviceId = 'A';
const p2pClientPlugin = require("../p2pClientPlugin");
const socketClient = require('socket.io-client');
const ioRaw = socketClient.connect(`http://localhost:9000?deviceId=${sourceDeviceId}`);
const io = p2pClientPlugin(ioRaw);

setTimeout(function () {
  io.registerP2pTarget('B', {});
  // io.emit2('testEvent', {a: 1}, 'b', 2, {c: 3});
  io.emit2('testEventAcknowledge', {a: 1}, 'b', 2, {c: 3}, function (result) {
    console.log(result);
  });
}, 1000);

io.on('testEventAcknowledge', function () {
  console.log(arguments);
});

/*
io.emit2('testEventAcknowledge', {a: 1}, {b: 1}, function (result) {

});*/
