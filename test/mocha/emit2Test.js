const expect = require('expect.js');
const {SERVER_CONFIG} = require('../../src/util/constants.js');

const socketIO = require('socket.io');
const http = require('http');
const p2pServerPlugin = require('../../src/p2pServerPlugin');

const client1Id = 'A';
const client2Id = 'B';
const p2pClientPlugin = require('../../src/p2pClientPlugin');
const socketClient = require('socket.io-client');

let client1;
let client2;
let server;
let io;

const startServer = function () {
  server = http.createServer((req, res) => res.end()).listen(SERVER_CONFIG.PORT);
  io = socketIO.listen(server);
  p2pServerPlugin(io);
}

const startClient = function (client, clientId) {
  const io = socketClient.connect(`http://localhost:${SERVER_CONFIG.PORT}?clientId=${clientId}`);
  return p2pClientPlugin(io);
}

beforeEach(function () {
  startServer();
  client1 = startClient(client1, client1Id);
  client2 = startClient(client2, client2Id);
});

describe('p2pClientPlugin getClientList function', function () {
  it('should list all connected client ids', async function () {
    let clientList = await client1.getClientList();
    expect(clientList).to.have.length(2);
    expect(clientList).to.contain(client1Id);
    expect(clientList).to.contain(client2Id);
    // Ensure that result should be the same with different clients
    clientList = await client2.getClientList();
    expect(clientList).to.have.length(2);
    expect(clientList).to.contain(client1Id);
    expect(clientList).to.contain(client2Id);
  })

  it('should update correctly if client disconnects', async function () {
    client1.unregisterP2pTarget();
  })
});
