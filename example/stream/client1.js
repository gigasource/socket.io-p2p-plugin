const sourceClientId = 'A';
const p2pClientPlugin = require("../../src/p2p-client-plugin");
const socketClient = require('socket.io-client');
const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const socket = p2pClientPlugin(rawSocket);

async function test() {
  const connectionSuccess = await socket.registerP2pTarget('B');
  if (!connectionSuccess) return;

  const duplex = await socket.registerP2pStream({});
  if (!duplex) return;

  let i = 0;
  let needDrain = false;

  duplex.on('drain', () => needDrain = false);

  setInterval(() => {
    if (needDrain) return;

    needDrain = !duplex.write(`a very loooooooooooooooooooooooooooooooooooooooooong message ${i}\n`); // write returns false if it needs drain
    console.log(needDrain);
    i++;
  }, 500);
}

test();
