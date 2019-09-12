const p2pServerPlugin = require('../p2pServerPlugin');
const http = require('http');
const socketIO = require('socket.io');

const httpServer = http.createServer((req, res) => res.end()).listen(9000);

const io = socketIO.listen(httpServer, {
  pingInterval: 1000,
  pingTimeout: 60000,
});

const server = p2pServerPlugin(io);

setTimeout(() => {
  console.log(server.getAllClientId());
}, 10000);
