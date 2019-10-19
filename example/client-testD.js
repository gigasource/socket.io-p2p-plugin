const sourceClientId = 'D';
const p2pClientPlugin = require("../src/p2p-client-plugin");
const socketClient = require('socket.io-client');
const ioRaw = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}&serviceName=test`);
const io = p2pClientPlugin(ioRaw);

io.emit('SUBSCRIBE_EVENT');
io.on('EVENT_WATCH', data => console.log(data));
