const sourceClientId = 'js1';
const p2pClientPlugin = require("../p2pClientPlugin");
const socketClient = require('socket.io-client');
const ioRaw = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const io = p2pClientPlugin(ioRaw);

try {
  io.registerP2pTarget('D2', {}, () => {
    io.getClientList((clientList) => {
      console.log(clientList);
    });

    io.emit2('testNoAckFromJava', {a: 'testNoAck'}, 'b', 2, {c: 3});

    io.emit2('testAckFromJava', {a: 'testAck'}, 'b', 2, {c: 3}, function (result) {
      console.log(result);
    });
  });
} catch (e) {
  // handle error if connection can't be made (client is busy, client is offline, ...)
  console.error(e);
}
