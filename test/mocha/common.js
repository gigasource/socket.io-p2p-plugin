const {SERVER_CONFIG} = require('../../src/util/constants.js');

// const socketIO = require('socket.io');
const socketClient = require('socket.io-client');
const p2pServerPlugin = require('../../src/p2p-server-plugin');
const p2pClientPlugin = require('../../src/p2p-client-plugin');
const http = require('http');
const uuidv1 = require('uuid/v1');

let httpServer;
let io;
let port = SERVER_CONFIG.PORT;

module.exports.startServer = function () {
  port++; // to run test files on separated servers
  if (httpServer) httpServer.close();
  httpServer = http.createServer((req, res) => res.end()).listen(port);

  io = require('socket.io').listen(httpServer);
  return p2pServerPlugin(io);
}

module.exports.stopServer = function () {
  httpServer.close();
  io.close();
}

module.exports.startClient = function (clientId) {
  const ioClient = socketClient.connect(`http://localhost:${port}?clientId=${clientId}`);
  return p2pClientPlugin(ioClient, clientId);
}

module.exports.wait = async function (ms) {
  const waitPromise = new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, ms);
  });

  await waitPromise;
}

module.exports.terminateClients = function (...clients) {
  clients.forEach(client => {
    if (client) {
      client.disconnect();
      client.destroy();
    }
  });
}

module.exports.generateClientIds = function (numberOfClients) {
  const ids = [];

  for (let i = 0; i < numberOfClients; i++) {
    ids.push(uuidv1());
  }

  return ids;
}
