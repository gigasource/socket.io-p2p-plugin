const sourceClientId = 'A';
const p2pClientPlugin = require("../src/p2p-client-plugin");
const socketClient = require('socket.io-client');
const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const socket = p2pClientPlugin(rawSocket, sourceClientId);
const uuidv1 = require('uuid/v1');

(() => {
  const fn = () => {
    console.log('abc');
  }

  socket.on('abc', fn);
  socket.on('def', fn);
  socket.on('ghi', fn);
  socket.off();
  fn();
  setTimeout(() => {
    console.log(socket);
  }, 1000);
})();
