const http = require('http');
const socketIO = require('socket.io');
const p2pServerPlugin = require('../src/p2p-server-plugin');

const httpServer = http.createServer((req, res) => res.end()).listen(9000);

const io = socketIO.listen(httpServer, {}); // see https://socket.io/docs/server-api/#new-Server-httpServer-options for server options

const server = p2pServerPlugin(io);
