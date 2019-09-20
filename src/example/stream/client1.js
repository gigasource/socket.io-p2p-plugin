const sourceClientId = 'A';
const p2pClientPlugin = require("../../p2p-client-plugin");
const socketClient = require('socket.io-client');
const ioRaw = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const io = p2pClientPlugin(ioRaw);
const createClientStream = require('../../lib/stream.js');
const streamify = require('stream-array');

async function test() {
  // const connectionSuccess = await io.registerP2pTarget('B');
  // const connectionSuccess = await io.registerP2pTarget('B');
  let i = 0;
  let needDrain = false;
  const duplex = createClientStream(io, {
    highWaterMark: 300
  });
  const cb = (i) => console.log('write success for ' + i);

  // duplex.write = new Proxy(duplex.write, {
  //   apply: (fn, thisArg, args) => {
  //     console.log(`write called, arg = ${args[0]}`);
  //     return fn.apply(thisArg, args);
  //   }
  // });


  // let stdin = process.stdin;
  // stdin.setRawMode(true);
  // stdin.resume();
  // stdin.setEncoding('utf8');
  // stdin.pipe(duplex);

  const input = [...new Array(40)].map(() => Math.round(Math.random() * 100) + '');
  const inputStream = streamify(input);
  inputStream.pipe(duplex);

  // duplex.on('drain', () => needDrain = false);
  //
  // setInterval(() => {
  //   if (needDrain) return;
  //
  //   needDrain = !duplex.write('a very loooooooooooooooooooooooooooooooooooooooooong message' + i + '\n'); // write returns false if it needs drain
  //   console.log(needDrain);
  //   i++;
  // }, 200);

  setTimeout(async () => {
    const connectionSuccess = await io.registerP2pTarget('B');
  }, 1000);
}

test();
