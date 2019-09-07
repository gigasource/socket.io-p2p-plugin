const sourceDeviceId = 'A';
const p2pClientPlugin = require("../p2pClientPlugin");
const socketClient = require('socket.io-client');
const ioRaw = socketClient.connect(`http://localhost:9000?deviceId=${sourceDeviceId}`);
const io = p2pClientPlugin(ioRaw, sourceDeviceId);

io.registerP2pTarget('B', {});

setTimeout(function () {
  // io.emit2('testEvent', {a: 1}, 'b', 2, {c: 3});
  io.emit2('testEventAcknowledge', {a: 1}, 'b', 2, {c: 3}, function (result) {
    console.log('testEventAcknowledge', result);
  });
}, 1000);

io.on2('testEventAcknowledge', function () {
  console.log(arguments);
});

/*
io.emit2('testEventAcknowledge', {a: 1}, {b: 1}, function (result) {

});*/
