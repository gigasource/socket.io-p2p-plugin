const chai = require('chai');
const expect = chai.expect;
const {SOCKET_EVENT} = require('../../../src/util/constants');
const {startServer, stopServer, startClients, wait, terminateClients} = require('../common');
const {Duplex} = require('stream');

describe('Stream API for p2p server as p2p client', function () {
  const numberOfClients = 3;

  let client1, client2, client3;
  let server;

  before(async function () {
    server = startServer({applyClientPlugins: true});
  });

  after(function () {
    stopServer();
  });

  beforeEach(async function () {
    [client1, client2, client3] = startClients(numberOfClients);
    await wait(200);
  });

  afterEach(async function () {
    terminateClients(client1, client2, client3);
    await wait(200);
  });

  describe('p2p-server-plugin with client plugins applied', function () {
    it('should be able to create streams connected to specific clients', async function () {
      client1.onAddP2pStream(null, () => {
      });

      const duplex1 = await server.addP2pStream(client1.clientId, null);
      const duplex2 = await server.addP2pStream(client1.clientId, null);

      expect(duplex1 instanceof Duplex).to.equal(true);
      expect(duplex1 === duplex2).to.equal(false);
    });
  });
});
