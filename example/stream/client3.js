const sourceClientId = 'C';
const p2pClientPlugin = require("../../src/p2p-client-plugin");
const socketClient = require('socket.io-client');
const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const socket = p2pClientPlugin(rawSocket, sourceClientId);

async function test() {
  const duplex = await socket.addP2pStream('B', {});
  const duplex2 = await socket.addP2pStream('D', {});

  setInterval(() => {
    duplex.write(`from client ${sourceClientId} to B\n`);
    duplex2.write(`from client ${sourceClientId} to D\n`);
  }, 500);
}

test();
