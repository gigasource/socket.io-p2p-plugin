const clientId = 'target';
const socketClient = require('socket.io-client');
const p2pClientPlugin = require("../../../src/p2p-client-plugin");

const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${clientId}`);
const socket = p2pClientPlugin(rawSocket, clientId);

// onAny is used to listen to events from any clients
socket.onAny('test-event', targetClientId => console.log(`Received message from client ${targetClientId}`));
socket.onceAny('test-event', () => console.log('This should happen only once'));
