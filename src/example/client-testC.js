const sourceClientId = 'C';
const p2pClientPlugin = require("../p2pClientPlugin");
const socketClient = require('socket.io-client');
const ioRaw = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const io = p2pClientPlugin(ioRaw);

const test = async () => {
  const connectionSuccess = await io.registerP2pTarget('B', {});

  if (connectionSuccess) {
    console.log('success');
  } else {
    console.log('failed');
  }
}

test();
