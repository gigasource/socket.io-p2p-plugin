const sourceClientId = 'A';
const p2pClientPlugin = require("../../p2p-client-plugin");
const socketClient = require('socket.io-client');
const ioRaw = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const io = p2pClientPlugin(ioRaw);
const {createClientStream} = require('../../lib/stream.js');

async function test() {
  const duplex = createClientStream(io);

  const cb = (i) => console.log('write success for ' + i);

  const connectionSuccess = await io.registerP2pTarget('B');

  if (connectionSuccess) {
    console.log('connect success');

    // duplex.write('hello', 'utf8');
    // duplex.write(' from ', 'utf8');
    // duplex.write(sourceClientId, 'utf8');

    for(let i = 0; i < 20; i++) {
      duplex.write('a very loooooooooooooooooooooooooooooooooooooooooong message' + i + '\n', cb.bind(null, i));
    }

    // duplex.write(' from ');
    // duplex.write(sourceClientId);
  }
}

test();
