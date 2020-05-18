const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;
const {SOCKET_EVENT: {P2P_EMIT_STREAM, STREAM_IDENTIFIER_PREFIX, PEER_STREAM_DESTROYED, TARGET_DISCONNECT, P2P_EMIT_ACKNOWLEDGE}}
    = require('../../../src/util/constants');
const {startServer, stopServer, startClients, wait, terminateClients} = require('../common');
const {Duplex} = require('stream');
const streamify = require('stream-array');
chai.use(chaiAsPromised);

describe('Stream API for p2p server as p2p client', function () {
  const numberOfClients = 3;

  let client1, serverSocket, client2;
  let server;

  before(async function () {
    server = startServer({applyClientPlugins: true});
  });

  after(function () {
    stopServer();
  });

  beforeEach(async function () {
    [client1, serverSocket, client2] = startClients(numberOfClients);
    await wait(200);
  });

  afterEach(async function () {
    terminateClients(client1, serverSocket, client2);
    await wait(200);
  });

  describe('Server Stream API', function () {
    describe('addStreamAsClient function', function () {
      it('should throw error if peer is not listening to add stream event', function () {
        return expect(server.addStreamAsClient(client1.clientId, {})).to.be.rejected;
      });
      it('should return a Duplex if peer is listening to add stream event', async function () {
        client1.onAddP2pStream();
        const duplex = await server.addStreamAsClient(client1.clientId, {});
        expect(duplex instanceof Duplex).to.equal(true);
      });
    });
    describe('the returned Duplex', function () {
      it('should listen to \'error\' event', async function () {
        client1.onAddP2pStream();
        const duplex = await server.addStreamAsClient(client1.clientId, {});
        expect(duplex._events.error instanceof Function).to.equal(true);
      });
      it('should be destroyable & remove related listeners on destroyed', async function () {
        const serverSocket = server.getSocketByClientId(client1.clientId);
        const originalCount1 = client1.listeners('disconnect').length;
        const originalCount2 = client1.listeners(TARGET_DISCONNECT).length;
        const originalCount3 = serverSocket.listeners('disconnect').length;
        const originalCount4 = serverSocket.listeners(P2P_EMIT_ACKNOWLEDGE).length;
        let sendDataEventFromServer, sendDataEventFromClient;

        client1.onAddP2pStream({}, duplex => {
          sendDataEventFromClient = `${P2P_EMIT_STREAM}${STREAM_IDENTIFIER_PREFIX}${duplex.targetStreamId}`;
        });
        const duplex = await server.addStreamAsClient(client1.clientId, {});
        await wait(100);

        expect(client1.listeners('disconnect')).to.have.lengthOf(originalCount1 + 1);
        expect(serverSocket.listeners('disconnect')).to.have.lengthOf(originalCount3 + 1);
        expect(client1.listeners(TARGET_DISCONNECT)).to.have.lengthOf(originalCount2 + 1);
        expect(serverSocket.listeners(P2P_EMIT_ACKNOWLEDGE)).to.have.lengthOf(originalCount4 + 1);
        expect(client1.listeners(sendDataEventFromClient)).to.have.lengthOf(1);
        expect(client1.listeners(PEER_STREAM_DESTROYED)).to.have.lengthOf(1);

        duplex.destroy();
        await wait(100);

        expect(duplex.destroyed).to.equal(true);

        expect(client1.listeners('disconnect')).to.have.lengthOf(originalCount1);
        expect(serverSocket.listeners('disconnect')).to.have.lengthOf(originalCount3);
        expect(client1.listeners(TARGET_DISCONNECT)).to.have.lengthOf(originalCount2);
        expect(serverSocket.listeners(P2P_EMIT_ACKNOWLEDGE)).to.have.lengthOf(originalCount4);
        expect(client1.listeners(sendDataEventFromClient)).to.have.lengthOf(0);
        expect(client1.listeners(PEER_STREAM_DESTROYED)).to.have.lengthOf(0);
      });
      it('should be able to transfer data to target client when connected', async function () {
        let serverDuplex, clientDuplex;
        const result = [];
        client1.onAddP2pStream({}, d => clientDuplex = d);
        serverDuplex = await server.addStreamAsClient(client1.clientId, {});

        clientDuplex.on('data', chunk => result.push(chunk.toString()));
        const inputArr = [...new Array(40)].map(() => Math.round(Math.random() * 100) + '');
        streamify(inputArr).pipe(serverDuplex);

        await wait(200);
        expect(result).to.have.lengthOf(inputArr.length);
        expect(result[0]).to.equal(inputArr[0]);
        expect(result[result.length - 1]).to.equal(inputArr[result.length - 1]);
      });
      it('should be able to receive data from target client when connected', async function () {
        let serverDuplex, clientDuplex;
        const result = [];
        client1.onAddP2pStream({}, d => clientDuplex = d);
        serverDuplex = await server.addStreamAsClient(client1.clientId, {});

        serverDuplex.on('data', chunk => result.push(chunk.toString()));
        const inputArr = [...new Array(40)].map(() => Math.round(Math.random() * 100) + '');
        streamify(inputArr).pipe(clientDuplex);

        await wait(200);
        expect(result).to.have.lengthOf(inputArr.length);
        expect(result[0]).to.equal(inputArr[0]);
        expect(result[result.length - 1]).to.equal(inputArr[result.length - 1]);
      });
      it('should send data to correct target', async function () {
        let clientDuplex1, clientDuplex2, serverDuplex1, serverDuplex2;
        let result1 = [];
        let result2 = [];

        client1.onAddP2pStream({}, d => clientDuplex1 = d);
        client2.onAddP2pStream({}, d => clientDuplex2 = d);

        serverDuplex1 = await server.addStreamAsClient(client1.clientId, {});
        serverDuplex2 = await server.addStreamAsClient(client2.clientId, {});

        const input1 = [1, 2, 3, 4, 5, 6].map(e => e.toString());
        const input2 = ['a', 'b', 'c'].map(e => e.toString());

        clientDuplex1.on('data', chunk => result1.push(chunk.toString()));
        clientDuplex2.on('data', chunk => result2.push(chunk.toString()));
        streamify(input1).pipe(serverDuplex1);
        streamify(input2).pipe(serverDuplex2);

        await wait(200);

        expect(result1).to.have.lengthOf(input1.length);
        expect(result2).to.have.lengthOf(input2.length);

        result1.forEach((e, index) => {
          expect(result1[index]).to.equal(input1[index]);
        });

        result2.forEach((e, index) => {
          expect(result2[index]).to.equal(input2[index]);
        });
      });
      it('should not suppress the throwing behavior of \'error\' events (throw the error to system)', async function () {
        client1.onAddP2pStream();
        const duplex = await server.addStreamAsClient(client1.clientId, {});

        expect(process.listenerCount('uncaughtException')).to.equal(1);
        const [listener] = process.listeners('uncaughtException');

        const result = new Promise(resolve => {
          process.removeAllListeners('uncaughtException');
          process.once('uncaughtException', (err) => {
            expect(err instanceof Error).to.equal(true);
            expect(err.message).to.equal('Test error message');
            process.on('uncaughtException', listener);
            resolve();
          });
        });

        process.nextTick(() => duplex.emit('error', new Error('Test error message')));
        await result;
      });
      it('should handle back pressure', async function () {
        console.log('this test will take about 10 seconds');
        this.timeout(20 * 1000);
        let producer;
        const consumerHighWaterMark = 40;

        client1.onAddP2pStream({}, d => producer = d);
        const consumer = await server.addStreamAsClient(client1.clientId, {highWaterMark: consumerHighWaterMark});
        const dataToBeSent = new Array(100).fill('W'); // 100 bytes
        const consumeRate = 10; // 10 bytes/s

        for (const chunk of dataToBeSent) {
          producer.write(chunk);
        }

        const checkInterval = new Promise(resolve => {
          // let i = 1;
          setInterval(function () {
            // console.log(`Read ${i++}: producer buffer length: ${producer._writableState.length} - consumer buffer length: ${consumer._readableState.length}`);
            const chunk = consumer.read(consumeRate);
            // console.log(`Data: ${chunk}\n`);
            if (chunk) {
              expect(consumer._readableState.length <= consumerHighWaterMark).to.equal(true); // ensure consumer's buffer will not go above consumer's highWaterMark
            } else {
              clearInterval(this);
              resolve(null);
            }
          }, 1000);
        });

        await checkInterval;
      });
    });
    describe('duplex lifecycle', function () {
      it('should be destroyed on error', async function () {
        client1.onAddP2pStream();
        const duplex = await server.addStreamAsClient(client1.clientId, {});
        expect(duplex.destroyed).to.equal(false);
        expect(duplex.emit.bind(duplex, 'error', new Error('test'))).to.throw();
        expect(duplex.destroyed).to.equal(true);
      });
      it('should be destroyed when client disconnects', async function () {
        let clientDuplex, serverDuplex;
        client1.onAddP2pStream({}, d => clientDuplex = d);
        serverDuplex = await server.addStreamAsClient(client1.clientId, {});

        expect(clientDuplex.destroyed).to.equal(false);
        expect(serverDuplex.destroyed).to.equal(false);

        client1.disconnect();
        await wait(50);

        expect(clientDuplex.destroyed).to.equal(true);
        expect(serverDuplex.destroyed).to.equal(true);
      });
      it('should send disconnect signal to client when destroyed', async function () {
        let clientDuplex, serverDuplex;
        client1.onAddP2pStream({}, d => clientDuplex = d);
        serverDuplex = await server.addStreamAsClient(client1.clientId, {});

        expect(clientDuplex.destroyed).to.equal(false);
        expect(serverDuplex.destroyed).to.equal(false);

        serverDuplex.destroy();
        await wait(50);

        expect(clientDuplex.destroyed).to.equal(true);
        expect(serverDuplex.destroyed).to.equal(true);
      });
    });
  });
});
