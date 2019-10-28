const p2pServerPlugin = require('../src/p2p-server-plugin');
const http = require('http');
const socketIO = require('socket.io');

const httpServer = http.createServer((req, res) => res.end()).listen(9000);

const io = socketIO.listen(httpServer, {
  pingInterval: 1000,
  pingTimeout: 60000,
});

const server = p2pServerPlugin(io);
