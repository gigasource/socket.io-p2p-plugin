const sourceClientId = 'B';
const p2pClientPlugin = require("../../src/p2p-client-plugin");
const socketClient = require('socket.io-client');
const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const socket = p2pClientPlugin(rawSocket, sourceClientId);

const test = () => {
  socket.onAddP2pTarget(source => {
    socket.from(source).on('test', args => {
      console.log(args);
      // socket.emitTo(source, 'reply', `hello from ${sourceClientId}, data = ${args}`);
    });
  });
}

test();
