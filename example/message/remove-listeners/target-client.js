const clientId = 'target';
const socketClient = require('socket.io-client');
const p2pClientPlugin = require("../../../src/p2p-client-plugin");

const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${clientId}`);
const socket = p2pClientPlugin(rawSocket, clientId);

// The usage is identical to basic 'off' function of Socket.IO, just remember to use from().off for from().on or from().once and use offAny for onAny or onceAny

socket.from('source').on('test-event', () => {
  console.log('This should be logged once: 1st');
  socket.from('source').off('test-event');
});

socket.onAny('test-event', () => {
  console.log('This should be logged once: 2nd');
  console.log('end');
  socket.offAny('test-event');
});
