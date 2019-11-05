const clientId = 'source';
const socketClient = require('socket.io-client');
const p2pClientPlugin = require("../../../src/p2p-client-plugin");

const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${clientId}`);
const socket = p2pClientPlugin(rawSocket, clientId);

setTimeout(() => socket.emitTo('target', 'test-event'), 500);
setTimeout(() => socket.emitTo('target', 'test-event'), 1000);
setTimeout(() => socket.emitTo('target', 'test-event'), 1500);
setTimeout(() => socket.emitTo('target', 'test-event'), 2000);
