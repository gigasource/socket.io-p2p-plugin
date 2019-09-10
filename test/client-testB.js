const sourceDeviceId = 'B';
const p2pClientPlugin = require("../src/p2pClientPlugin");
const socketClient = require('socket.io-client');
const ioRaw = socketClient.connect(`http://localhost:9000?deviceId=${sourceDeviceId}`);
const io = p2pClientPlugin(ioRaw);

io.on('testAck', (data, ackFn) => {
  console.log(data);
  ackFn(`Data returned from B: ${JSON.stringify(data)}`);
});

io.on('testNoAck', (data) => {
  console.log(data);
})
