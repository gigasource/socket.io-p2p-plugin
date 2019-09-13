const sourceClientId = 'C';
const p2pClientPlugin = require("../p2p-client-plugin");
const socketClient = require('socket.io-client');
const ioRaw = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const io = p2pClientPlugin(ioRaw);

// async/await example
const test = async () => {
  const connectionSuccess = await io.registerP2pTarget('B', {});

  if (connectionSuccess) {
    console.log('success');
  } else {
    console.log('failed');
  }

  console.log(await io.getClientList());
}

test();

// callback example
// io.registerP2pTarget('B', {}, () => {
//   console.log('success');
//   io.getClientList((clientList) => {
//     console.log(clientList);
//   })
// }, () => {
//   console.log('failed');
// })
