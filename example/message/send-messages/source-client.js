const clientId = 'source';
const socketClient = require('socket.io-client');
const p2pClientPlugin = require("../../../src/p2p-client-plugin");

const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${clientId}`);
const socket = p2pClientPlugin(rawSocket, clientId);

(async () => {
  // Test send messages with no acknowledgements
  socket.emitTo('target', 'test-event', 'payload from source');
  socket.emitTo('another-client', 'test-event', 'this should not be logged'); // This should trigger error log on server

  // although source can use emitTo directly, addP2pTarget is necessary since the listeners on target client side will be created in onAddP2pTarget
  await socket.addP2pTarget('target');

  // Test send messages with acknowledgements
  socket.emitTo('target', 'test-event', 'payload from source', returnedPayload => console.log(`payload returned form target: ${returnedPayload}`)); // this should be logged
  socket.emitTo('another-client', 'test-event', 'this should not be logged', returnedPayload => console.log('this should not be logged'));  // This should trigger error log on server
})();
