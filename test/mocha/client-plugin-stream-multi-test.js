const expect = require('expect.js');
const {Duplex} = require('stream');
const {startClient, generateClientIds, wait, terminateClients} = require('./common');
const streamToArray = require('stream-to-array');
const {SOCKET_EVENT} = require('../../src/util/constants');
const streamify = require('stream-array');

describe('stream API for p2p-client-plugin', function () {
  const numberOfClients = 4;
  let client1Id, client2Id, client3Id, client4Id;
  let client1, client2, client3, client4;

  beforeEach(async function () {
    [client1Id, client2Id, client3Id, client4Id] = generateClientIds(numberOfClients);

    client1 = startClient(client1Id);
    client2 = startClient(client2Id);
    client3 = startClient(client3Id);
    client4 = startClient(client4Id);
    await wait(200);
  })

  afterEach(async function () {
    terminateClients(client1, client2, client3, client4);
    await wait(200);
  })

  describe('constructor', function () {
    it('should create a MULTI_API_CREATE_STREAM to refuse connection attempt', async function () {
      expect(client1.listeners(SOCKET_EVENT.MULTI_API_CREATE_STREAM)).to.have.length(1);
      const duplex = await client2.addP2pStream(client1.clientId, {});
      expect(duplex).to.be(null);
    });
  })

  describe('addP2pStream function', function () {
    it('should return null if peer is not listening to add stream event', async function () {
      const duplex = await client2.addP2pStream(client1.clientId, {});
      expect(duplex).to.be(null);
    });
    it('should return a Duplex if peer is listening to add stream event', async function () {
      client2.onAddP2pStream();
      const duplex = await client1.addP2pStream(client2.clientId, {});
      expect(duplex instanceof Duplex).to.be(true);
    });
  });
  describe('onAddP2pStream function', function () {
    it('should remove default listener from constructor', async function () {
      let duplex;
      expect(client2.listeners(SOCKET_EVENT.MULTI_API_CREATE_STREAM).length).to.be(1);
      duplex = await client1.addP2pStream(client2.clientId, {});
      expect(duplex).to.be(null);
      expect(duplex instanceof Duplex).to.be(false);

      client2.onAddP2pStream({}, d => duplex2 = d);
      duplex = await client1.addP2pStream(client2.clientId, {});
      expect(duplex instanceof Duplex).to.be(true);
      expect(client2.listeners(SOCKET_EVENT.MULTI_API_CREATE_STREAM).length).to.be(1);
    });
    it('should remove old listeners if called more than once', function () {
      let duplex2;
      client2.onAddP2pStream({}, d => duplex2 = d);
      client2.onAddP2pStream({}, d => duplex2 = d);
      client2.onAddP2pStream({}, d => duplex2 = d);

      expect(client2.listeners(SOCKET_EVENT.MULTI_API_CREATE_STREAM).length).to.be(1);
    });
  })
  describe('the returned Duplex', function () {
    it('should listen to \'error\' event', async function () {
      client2.onAddP2pStream();
      const duplex = await client1.addP2pStream(client2.clientId, {});
      expect(duplex._events.error).to.be.a('function');
    });
    it('should be destroyable', async function () {
      client2.onAddP2pStream();
      const duplex = await client1.addP2pStream(client2.clientId, {});
      duplex.destroy();
      expect(duplex.destroyed).to.be(true);
    });
    it('should be able to transfer data to target client when connected', async function () {
      let duplex1, duplex2;
      client2.onAddP2pStream({}, d => duplex2 = d);
      duplex1 = await client1.addP2pStream(client2.clientId, {});
      ;

      const input = [...new Array(40)].map(() => Math.round(Math.random() * 100) + '');
      const inputStream = streamify(input);
      inputStream.pipe(duplex1);

      await wait(200);
      streamToArray(duplex2, (err, array) => {
        expect(array.length).to.be(40);
      });
    });
    it('should not suppress the throwing behavior of \'error\' events (throw the error to system)', async function () {
      client2.onAddP2pStream();
      const duplex1 = await client1.addP2pStream(client2.clientId, {});

      expect(process.listenerCount('uncaughtException')).to.be(1);
      const [listener] = process.listeners('uncaughtException');

      const result = new Promise(resolve => {
        process.removeAllListeners('uncaughtException');
        process.once('uncaughtException', (err) => {
          expect(err instanceof Error).to.be(true);
          expect(err.message).to.be('Test error message');
          process.on('uncaughtException', listener);
          resolve();
        });
      });

      process.nextTick(() => duplex1.emit('error', new Error('Test error message')));
      await result;
    });
    it('should handle back pressure', async function () {
      this.timeout(20 * 1000);
      let consumer;
      const consumerHighWaterMark = 40;

      client2.onAddP2pStream({
        highWaterMark: consumerHighWaterMark
      }, d => consumer = d);
      const producer = await client1.addP2pStream(client2.clientId, {});
      const dataToBeSent = new Array(100).fill('W'); // 100 bytes
      const consumeRate = 10; // 10 bytes/s

      dataToBeSent.forEach(e => producer.write(e));
      await wait(500);

      const checkInterval = new Promise(resolve => {
        let i = 1;
        setInterval(function () {
          console.log(`Read ${i++}: producer buffer length: ${producer._writableState.length} - consumer buffer length: ${consumer._readableState.length}`);
          const chunk = consumer.read(consumeRate);
          console.log(`Data: ${chunk}\n`)
          if (chunk) {
            expect(consumer._readableState.length <= consumerHighWaterMark).to.be(true); // ensure consumer's buffer will not go above consumer's highWaterMark
          } else {
            clearInterval(this);
            resolve(null);
          }
        }, 1000);
      });

      await checkInterval;
    });
    it('should allow both ends to add stream', async function () {
      client2.onAddP2pStream();
      const duplex1 = await client1.addP2pStream(client2.clientId, {});
      expect(duplex1 instanceof Duplex).to.be(true);

      client1.onAddP2pStream();
      const duplex2 = await client2.addP2pStream(client1.clientId, {});
      expect(duplex2 instanceof Duplex).to.be(true);
    });

    it('should ensure data integrity in case of bad network connection', function () {
      //TODO: Not yet implemented, need to find a way to test with a bad network connection
    });
    it('should not accumulate memory', async function () {
      // console.log(process.memoryUsage().heapUsed / 1024 / 1024); // in MBs
      //TODO: implement this, need to separate producer & consumer to test
    });
  });
  describe('stream lifecycle', function () {
    it('should be destroyed on error', async function () {
      client2.onAddP2pStream();
      const duplex1 = await client1.addP2pStream(client2.clientId, {});
      expect(duplex1.emit.bind(duplex1, 'error', new Error('test'))).to.throwError();
      expect(duplex1.destroyed).to.be(true);
    });
    it('should be destroyed on disconnecting (must work similarly on both ends, source & target)', async function () {
      let duplex2, duplex4;
      client2.onAddP2pStream({}, d => duplex2 = d);
      client4.onAddP2pStream({}, d => duplex4 = d);
      const duplex1 = await client1.addP2pStream(client2.clientId, {});
      const duplex3 = await client3.addP2pStream(client4.clientId, {});

      expect(duplex1.destroyed).to.be(false);
      expect(duplex2.destroyed).to.be(false);
      expect(duplex3.destroyed).to.be(false);
      expect(duplex4.destroyed).to.be(false);

      client1.disconnect();
      await wait(200);

      expect(duplex1.destroyed).to.be(true);
      expect(duplex2.destroyed).to.be(true);
      expect(duplex3.destroyed).to.be(false);
      expect(duplex4.destroyed).to.be(false);

      client3.disconnect();
      await wait(200);

      expect(duplex1.destroyed).to.be(true);
      expect(duplex2.destroyed).to.be(true);
      expect(duplex3.destroyed).to.be(true);
      expect(duplex4.destroyed).to.be(true);
    });
    it('a new stream should be created every time addP2pStream is used', async function () {
      let duplex2a, duplex2b, duplex2c, duplex2d;
      client2.onAddP2pStream({}, d => duplex2a = d);
      duplex2c = await client1.addP2pStream(client2.clientId, {});
      client2.onAddP2pStream({}, d => duplex2b = d);
      duplex2d = await client1.addP2pStream(client2.clientId, {});

      expect(duplex2a == duplex2b).to.be(false);
      expect(duplex2c == duplex2d).to.be(false);
    });
    it('should remove listeners on disconnection/target disconnection', async function () {
      const originalDisconnectListenerCount = client1.listeners('disconnect').length;
      const originalTargetDisconnectListenerCount = client1.listeners(SOCKET_EVENT.MULTI_API_TARGET_DISCONNECT).length;
      let duplex2, duplex3, duplex4;

      client2.onAddP2pStream();
      client3.onAddP2pStream();
      client4.onAddP2pStream();

      duplex2 = await client1.addP2pStream(client2.clientId, {});
      duplex3 = await client1.addP2pStream(client3.clientId, {});
      duplex4 = await client1.addP2pStream(client4.clientId, {});

      // events we need to check in client 1
      const duplexSendDataEvent2 = `${SOCKET_EVENT.P2P_EMIT_STREAM}-from-stream-${duplex2.targetStreamId}-from-${client2.clientId}`;
      const duplexSendDataEvent3 = `${SOCKET_EVENT.P2P_EMIT_STREAM}-from-stream-${duplex3.targetStreamId}-from-${client3.clientId}`;
      const duplexSendDataEvent4 = `${SOCKET_EVENT.P2P_EMIT_STREAM}-from-stream-${duplex4.targetStreamId}-from-${client4.clientId}`;

      // an event we need to check in client 4
      const duplexSendDataEvent4OfClient4 = `${SOCKET_EVENT.P2P_EMIT_STREAM}-from-stream-${duplex4.sourceStreamId}-from-${client1.clientId}`;

      expect(client1.listeners(duplexSendDataEvent2)).to.have.length(1);
      expect(client1.listeners(duplexSendDataEvent3)).to.have.length(1);
      expect(client1.listeners(duplexSendDataEvent4)).to.have.length(1);
      expect(client1.listeners('disconnect')).to.have.length(originalDisconnectListenerCount + 3);
      expect(client1.listeners(SOCKET_EVENT.MULTI_API_TARGET_DISCONNECT)).to.have.length(originalTargetDisconnectListenerCount + 3);

      client2.disconnect();
      await wait(200);
      expect(client1.listeners(duplexSendDataEvent2)).to.have.length(0);
      expect(client1.listeners(duplexSendDataEvent3)).to.have.length(1);
      expect(client1.listeners(duplexSendDataEvent4)).to.have.length(1);
      expect(client1.listeners('disconnect')).to.have.length(originalDisconnectListenerCount + 2);
      expect(client1.listeners(SOCKET_EVENT.MULTI_API_TARGET_DISCONNECT)).to.have.length(originalTargetDisconnectListenerCount + 2);

      client3.disconnect();
      await wait(200);
      expect(client1.listeners(duplexSendDataEvent2)).to.have.length(0);
      expect(client1.listeners(duplexSendDataEvent3)).to.have.length(0);
      expect(client1.listeners(duplexSendDataEvent4)).to.have.length(1);
      expect(client1.listeners('disconnect')).to.have.length(originalDisconnectListenerCount + 1);
      expect(client1.listeners(SOCKET_EVENT.MULTI_API_TARGET_DISCONNECT)).to.have.length(originalTargetDisconnectListenerCount + 1);

      /* client1 (active side) initializes connections to client2, 3, 4 (passive side)
         Previously, we check the disconnection of active side by disconnecting client 2 & 3
         Now, we also need to check the disconnection of passive side by disconnecting client 1 & check the listeners of client 4
         (also need to check client 1 to see if 'disconnect' listener works properly)
      */
      expect(client4.listeners(duplexSendDataEvent4OfClient4)).to.have.length(1);
      expect(client1.listeners(duplexSendDataEvent4)).to.have.length(1);
      expect(client4.listeners(SOCKET_EVENT.MULTI_API_TARGET_DISCONNECT)).to.have.length(originalTargetDisconnectListenerCount + 1);
      expect(client1.listeners(SOCKET_EVENT.MULTI_API_TARGET_DISCONNECT)).to.have.length(originalTargetDisconnectListenerCount + 1);
      expect(client4.listeners('disconnect')).to.have.length(originalDisconnectListenerCount + 1);
      expect(client1.listeners('disconnect')).to.have.length(originalDisconnectListenerCount + 1);

      client1.disconnect();
      await wait(200);
      expect(client4.listeners(duplexSendDataEvent4OfClient4)).to.have.length(0);
      expect(client1.listeners(duplexSendDataEvent4)).to.have.length(0);
      expect(client4.listeners(SOCKET_EVENT.MULTI_API_TARGET_DISCONNECT)).to.have.length(originalTargetDisconnectListenerCount);
      expect(client1.listeners(SOCKET_EVENT.MULTI_API_TARGET_DISCONNECT)).to.have.length(originalTargetDisconnectListenerCount);
      expect(client4.listeners('disconnect')).to.have.length(originalDisconnectListenerCount);
      expect(client1.listeners('disconnect')).to.have.length(originalDisconnectListenerCount);
    });
  })
})
