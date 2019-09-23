const sourceClientId = 'B';
const p2pClientPlugin = require("../../p2p-client-plugin");
const socketClient = require('socket.io-client');
const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const socket = p2pClientPlugin(rawSocket);

const {StringDecoder} = require('string_decoder');
const decoder = new StringDecoder('utf8');

socket.onRegisterP2pStream({}, duplex => {
  duplex.pipe(process.stdout);
});

// If user wants to disconnect, it is required to call socket.offRegisterP2pStream to prevent new Duplex from being created
