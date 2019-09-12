const p2pServerPlugin = require('../p2pServerPlugin');
const http = require('http');
const socketIO = require('socket.io');

const server = http.createServer((req, res) => res.end()).listen(9000);

const io = socketIO.listen(server, {
  pingInterval: 1000,
  pingTimeout: 5000,
});

p2pServerPlugin(io);
