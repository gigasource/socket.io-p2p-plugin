const expect = require('expect.js');
const {SOCKET_EVENT} = require('../../src/util/constants');
const {startServer, stopServer, startClient} = require('./common');

const client1Id = 'A';
const client2Id = 'B';
const client3Id = 'C';

let client1;
let client2;
let client3;
let server;

beforeEach(async function () {
  server = startServer();
  client1 = startClient(client1, client1Id);
  client2 = startClient(client2, client2Id);
  client3 = startClient(client3, client3Id);
});

afterEach(function () {
  stopServer();
});
