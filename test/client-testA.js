const p2pClientPlugin = require("../p2pClientPlugin");

let socketClient = require('socket.io-client');
const ioRaw = socketClient.connect('http://localhost:9000?deviceId=A');
const io = p2pClientPlugin(ioRaw);

io.registerP2pTarget('B', {});

setTimeout(function () {
  io.emit2('testEvent', {a: 1});
  io.emit2('testEventAcknowledge', {a: 1}, function (result) {
    console.log('testEventAcknowledge', result);
  });
}, 1000);

/*
io.emit2('testEventAcknowledge', {a: 1}, {b: 1}, function (result) {

});*/
