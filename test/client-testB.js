const sourceDeviceId = 'B';
const p2pClientPlugin = require("../p2pClientPlugin");
const socketClient = require('socket.io-client');
const ioRaw = socketClient.connect(`http://localhost:9000?deviceId=${sourceDeviceId}`);
const io = p2pClientPlugin(ioRaw);

io.on('testEventAcknowledge', function () {
  io.emit2('testEventAcknowledge', {abc: 'test'});
});

