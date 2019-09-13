const sourceClientId = 'A';
const p2pClientPlugin = require("../p2p-client-plugin");
const socketClient = require('socket.io-client');
const ioRaw = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const io = p2pClientPlugin(ioRaw);

const test = async () => {
  const connectionSuccess = await io.registerP2pTarget('B', {});

  if (connectionSuccess) {
    console.log(io.targetClientId);
    console.log(await io.getClientList());

    io.emit2('testNoAck', {a: 'testNoAck'}, 'b', 2, {c: 3});

    io.emit2('testAck', {a: 'testAck'}, 'b', 2, {c: 3}, function (result) {
      console.log(typeof result);
    });

    setTimeout(() => {
      // io.disconnect();
      io.unregisterP2pTarget(() => {
        console.log('unregister');
      });
    }, 3000);
  } else {
    // Failed connection -> client can add logic to handle here
    console.log('failed');
  }
}

test();
