const sourceClientId = 'B';
const p2pClientPlugin = require("../src/p2p-client-plugin");
const socketClient = require('socket.io-client');
const ioRaw = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const io = p2pClientPlugin(ioRaw);

io.on('testAck', (arg1, arg2, arg3, arg4, ackFn) => {
  console.log(arg1);
  ackFn(arg1);
});

io.on('testNoAck', (arg1, arg2, arg3, arg4) => {
  console.log(arg1);
})

io.on('testNoAckFromJava', (arg1, arg2, arg3) => {
  console.log(arg1 + arg2 + arg3);
})

io.on('testAckFromJava', (arg1, ackFn) => {
  console.log(arg1);
  ackFn(`Data returned from B: ${JSON.stringify(arg1)}`);
});
