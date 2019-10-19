const sourceClientId = 'A';
const p2pClientPlugin = require("../../src/p2p-client-plugin");
const socketClient = require('socket.io-client');
const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const socket = p2pClientPlugin(rawSocket, sourceClientId);
const targets = ['B', 'D'];
let i = 1;

const test = () => {
  targets.forEach(e => {
    socket.addP2pTarget(e);
    // socket.from(e).on('reply', data => console.log(data));
  });

  setInterval(() => {
    const index = Math.floor(Math.random() * 2);
    socket.emitTo(targets[index], 'test', `Attempt ${i++}: data comes from ${sourceClientId}`);
  }, 1000);
}

test();
