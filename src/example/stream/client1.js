const sourceClientId = 'A';
const p2pClientPlugin = require("../../p2p-client-plugin");
const socketClient = require('socket.io-client');
const ioRaw = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const io = p2pClientPlugin(ioRaw);
const {createClientStream} = require('../../lib/stream.js');

async function test() {
  const connectionSuccess = await io.registerP2pTarget('B');
  let i = 0;
  const duplex = createClientStream(io);
  const cb = (i) => console.log('write success for ' + i);

  // duplex.write = new Proxy(duplex.write, {
  //   apply: (fn, thisArg, args) => {
  //     console.log(`write called, arg = ${args[0]}`);
  //     return fn.apply(thisArg, args);
  //   }
  // });

  setInterval(() => {
    duplex.write('a very loooooooooooooooooooooooooooooooooooooooooong message' + i + '\n');
    i++;
  }, 500);

  // setTimeout(async () => {
  //   const connectionSuccess = await io.registerP2pTarget('B');
  // }, 3000);
}

test();
