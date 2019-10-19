const sourceClientId = 'D';
const p2pClientPlugin = require("../../src/p2p-client-plugin");
const socketClient = require('socket.io-client');
const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const socket = p2pClientPlugin(rawSocket, sourceClientId);

const {StringDecoder} = require('string_decoder');
const decoder = new StringDecoder('utf8');

socket.onAddP2pStream({}, duplex => {
  duplex.pipe(process.stdout);
});

setInterval(() => {
  console.log(socket);
}, 1000);
// If user wants to disconnect, it is required to call socket.offRegisterP2pStream to prevent new Duplex from being created
