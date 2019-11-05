const clientId = 'target';
const socketClient = require('socket.io-client');
const p2pClientPlugin = require("../../../src/p2p-client-plugin");

const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${clientId}`);
const socket = p2pClientPlugin(rawSocket, clientId);

let clientCount = 0;

console.log('Logs should be printed every seconds without duplicates')

socket.onAddP2pStream({}, (duplex) => duplex.pipe(process.stdout));
