const {SERVER_CONFIG} = require('../../src/util/constants.js');

const socketIO = require('socket.io');
const socketClient = require('socket.io-client');
const p2pServerPlugin = require('../../src/p2p-server-plugin');
const p2pClientPlugin = require('../../src/p2p-client-plugin');
const http = require('http');
const uuidv1 = require('uuid/v1');
const redis = require('socket.io-redis');

let httpServer;
let io;
let port = SERVER_CONFIG.PORT;

module.exports.startServer = (options) => {
  port++; // use a new server in every run (all tests in a set use the same server)
  httpServer = http.createServer((req, res) => res.end()).listen(port);

  io = socketIO(httpServer);

  if (options && options.redisTest) io.adapter(redis({host: 'localhost', port: 6379}));

  const server = p2pServerPlugin(io, options);

  server.port = port;
  server.cleanup = () => {
    httpServer.close();
    io.close();
  }

  return server;
}

module.exports.stopServer = () => {
  httpServer.close();
  io.close();
}

module.exports.wait = async (ms) => await new Promise(resolve => setTimeout(resolve, ms));

module.exports.startClients = (numberOfClients, serverPort) => {
  const clients = [];

  for (let i = 0; i < numberOfClients; i++) {
    const clientId = uuidv1();
    const client = socketClient.connect(`http://localhost:${serverPort || port}?clientId=${clientId}`);
    clients.push(p2pClientPlugin(client, clientId));
  }

  return clients;
}

module.exports.startServiceClients = (numberOfClients) => {
  const clients = [];

  for (let i = 0; i < numberOfClients; i++) {
    const clientId = uuidv1();
    const client = socketClient.connect(`http://localhost:${port}?clientId=${clientId}`);
    clients.push(p2pClientPlugin(client, clientId, {isService: true}));
  }

  return clients;
}

module.exports.terminateClients = (...clients) => {
  clients.forEach(client => {
    if (client) {
      client.disconnect();
      client.destroy();
    }
  });
}

module.exports.getCurrentServerPort = function () {
  return port;
}
