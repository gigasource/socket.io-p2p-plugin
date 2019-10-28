const {SERVER_CONFIG} = require('../../src/util/constants.js');

const socketIO = require('socket.io');
const socketClient = require('socket.io-client');
const p2pServerPlugin = require('../../src/p2p-server-plugin');
const p2pClientPlugin = require('../../src/p2p-client-plugin');
const http = require('http');
const uuidv1 = require('uuid/v1');

let httpServer;
let io;
let port = SERVER_CONFIG.PORT;

const startServer = () => {
  port++; // use a new server in every run (all tests use the same server)
  httpServer = http.createServer((req, res) => res.end()).listen(port);

  io = socketIO.listen(httpServer);
  return p2pServerPlugin(io);
}

const stopServer = () => {
  httpServer.close();
  io.close();
}

module.exports.wait = async (ms) => {
  const waitPromise = new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, ms);
  });

  await waitPromise;
}

module.exports.startClients = (numberOfClients) => {
  const clients = [];

  for (let i = 0; i < numberOfClients; i++) {
    const clientId = uuidv1();
    const client = socketClient.connect(`http://localhost:${port}?clientId=${clientId}`);
    clients.push(p2pClientPlugin(client, clientId));
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

before(async function () {
  module.exports.server = startServer();
});

after(function () {
  stopServer();
});
