const sourceClientId = 'A';
const p2pClientPlugin = require("../src/p2p-client-plugin");
const socketClient = require('socket.io-client');
const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const socket = p2pClientPlugin(rawSocket, sourceClientId);

const test = async () => {
  const connectionSuccess = await socket.registerP2pTarget('B', {});

  if (connectionSuccess) {
    console.log(socket.targetClientId);
    console.log(await socket.getClientList());

    socket.emit2('testNoAck', {a: 'testNoAck'}, 'b', 2, {c: 3});

    socket.emit2('testAck', {a: 'testAck'}, 'b', 2, {c: 3}, function (result) {
      console.log(typeof result);
    });

    setTimeout(() => {
      // io.disconnect();
      socket.unregisterP2pTarget(() => {
        console.log('unregister');
      });
    }, 3000);
  } else {
    // Failed connection -> client can add logic to handle here
    console.log('failed');
  }
}

test();
