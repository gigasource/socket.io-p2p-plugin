const clientId = 'target';
const socketClient = require('socket.io-client');
const p2pClientPlugin = require("../../../src/p2p-client-plugin");

const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${clientId}`);
const socket = p2pClientPlugin(rawSocket, clientId);

// if target knows source client id before-hand, target can listens directly like this
// from is used to filter message from clients, if filtering is not necessary, use onAny
socket.from('source').on('test-event', payload => console.log(`Received test-event from client source with payload: ${payload}`)); // this should be logged
socket.from('another-client').on('test-event', () => console.log('This should not be logged'));

socket.onAddP2pTarget(targetClientId => { // this is used if target can't know source client id until connection is made
  console.log(targetClientId); // this should log 'source'

  // Test receive message with acknowledgements
  socket.from(targetClientId).on('test-event', (payload, ack) => {
    console.log(`Second listener: Received test-event from client source with payload: ${payload}`); // this should be logged
    if (ack) ack('Returned payload from target');
  });
});
