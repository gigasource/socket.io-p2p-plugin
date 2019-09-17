const sourceClientId = 'B';
const p2pClientPlugin = require("../../p2p-client-plugin");
const socketClient = require('socket.io-client');
const ioRaw = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const io = p2pClientPlugin(ioRaw);
const {createClientStream} = require('../../lib/stream.js');

const {StringDecoder} = require('string_decoder');
const decoder = new StringDecoder('utf8');

const duplex = createClientStream(io, {
  remainOnDisconnect: true,
  highWaterMark: 50
});

duplex.pipe(process.stdout);

// setInterval(() => {
//   const chunk = duplex.read(5);
//   if (chunk) {
//     const s = decoder.write(chunk);
//     console.log(s);
//   }
// }, 500);
