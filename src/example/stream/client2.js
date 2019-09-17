const sourceClientId = 'B';
const p2pClientPlugin = require("../../p2p-client-plugin");
const socketClient = require('socket.io-client');
const ioRaw = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const io = p2pClientPlugin(ioRaw);
const {createClientStream} = require('../../lib/stream.js');

const {Throttle} = require('stream-throttle');

const {StringDecoder} = require('string_decoder');
const decoder = new StringDecoder('utf8');

const duplex = createClientStream(io, {
  highWaterMark: 1
});

// setTimeout(() => {
//   const chunk = duplex.read();
// },3000);
duplex.pipe(new Throttle({rate: 10})).pipe(process.stdout);
