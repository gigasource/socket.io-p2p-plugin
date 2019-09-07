const p2pClientPlugin = require("../p2pClientPlugin");

let socketClient = require('socket.io-client');
const ioRaw = socketClient.connect('http://localhost:9000?deviceId=B');
const io = p2pClientPlugin(ioRaw);

io.on('testEvent', function () {
  console.log(arguments);
});
