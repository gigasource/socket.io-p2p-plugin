const p2pServerPlugin = require('../p2pServerPlugin');
//import http from "http";
const http = require('http');
const socketIO = require('socket.io');

const server = http.createServer((req, res) => {
  res.end();
}).listen(9000);

const io = socketIO.listen(server);
p2pServerPlugin(io);
