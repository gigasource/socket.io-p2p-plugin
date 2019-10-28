const expect = require('expect.js');
const {Duplex} = require('stream');
const {startClient, generateClientIds, wait, terminateClients} = require('../common');
const streamToArray = require('stream-to-array');
const {SOCKET_EVENT} = require('../../../src/util/constants');
const streamify = require('stream-array');

describe('Stream API', function () {
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

  describe('registerP2pStream function', function () {
    it('should return null if peer is not listening to register stream event', async function () {
      expect(await client1.registerP2pTarget(client2Id)).to.be(true);

      const duplex = await client1.registerP2pStream({});
      expect(duplex).to.be(null);
    });
    it('should return a Duplex if peer is listening to register stream event', async function () {
      expect(await client1.registerP2pTarget(client2Id)).to.be(true);

      client2.onRegisterP2pStream();
      const duplex = await client1.registerP2pStream({});
      expect(duplex instanceof Duplex).to.be(true);
    });
  });
  describe('onRegisterP2pStream function', function () {
    it('should remove old listeners if called more than once', function () {
      let duplex2;
      client2.onRegisterP2pStream({}, d => duplex2 = d);
      client2.onRegisterP2pStream({}, d => duplex2 = d);
      client2.onRegisterP2pStream({}, d => duplex2 = d);

      expect(client2.listeners(SOCKET_EVENT.P2P_REGISTER_STREAM).length).to.be(1);
    });
  })
  describe('the returned Duplex', function () {
    it('should listen to \'error\' event', async function () {
      expect(await client1.registerP2pTarget(client2Id)).to.be(true);

      client2.onRegisterP2pStream();
      const duplex = await client1.registerP2pStream({});
      expect(duplex._events.error).to.be.a('function');
    });
    it('should be destroyable', async function () {
      expect(await client1.registerP2pTarget(client2Id)).to.be(true);

      client2.onRegisterP2pStream();
      const duplex = await client1.registerP2pStream({});
      duplex.destroy();
      expect(duplex.destroyed).to.be(true);
    });
    it('should be able to transfer data to target client when connected', async function () {
      let duplex2;
      expect(await client1.registerP2pTarget(client2Id)).to.be(true);
      client2.onRegisterP2pStream({}, d => duplex2 = d);
      const duplex1 = await client1.registerP2pStream({});

      const input = [...new Array(40)].map(() => Math.round(Math.random() * 100) + '');
      const inputStream = streamify(input);
      inputStream.pipe(duplex1);

      await wait(200);
      streamToArray(duplex2, (err, array) => {
        expect(array.length).to.be(40);
      });
    });
    it('should not suppress the throwing behavior of \'error\' events (throw the error to system)', async function () {
      expect(await client1.registerP2pTarget(client2Id)).to.be(true);
      client2.onRegisterP2pStream();
      const duplex1 = await client1.registerP2pStream({});

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
      expect(await client1.registerP2pTarget(client2Id)).to.be(true);
      client2.onRegisterP2pStream({
        highWaterMark: consumerHighWaterMark
      }, d => consumer = d);
      const producer = await client1.registerP2pStream({});
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
    it('should allow both ends to register stream', async function () {
      expect(await client1.registerP2pTarget(client2Id)).to.be(true);
      client2.onRegisterP2pStream();
      const duplex1 = await client1.registerP2pStream({});
      expect(duplex1 instanceof Duplex).to.be(true);

      await client1.unregisterP2pTarget();
      expect(await client1.registerP2pTarget(client2Id)).to.be(true);
      client1.onRegisterP2pStream();
      const duplex2 = await client2.registerP2pStream({});
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
      expect(await client1.registerP2pTarget(client2Id)).to.be(true);
      client2.onRegisterP2pStream();
      const duplex1 = await client1.registerP2pStream({});
      expect(duplex1.emit.bind(duplex1, 'error', new Error('test'))).to.throwError();
      expect(duplex1.destroyed).to.be(true);
    });
    it('should be destroyed on disconnecting & unregistering (must work similarly on both ends, source & target)', async function () {
      let duplex2, duplex4;
      expect(await client1.registerP2pTarget(client2Id)).to.be(true);
      expect(await client3.registerP2pTarget(client4Id)).to.be(true);
      client2.onRegisterP2pStream({}, d => duplex2 = d);
      client4.onRegisterP2pStream({}, d => duplex4 = d);
      const duplex1 = await client1.registerP2pStream({});
      const duplex3 = await client3.registerP2pStream({});

      expect(duplex1.destroyed).to.be(false);
      expect(duplex2.destroyed).to.be(false);
      expect(duplex3.destroyed).to.be(false);
      expect(duplex4.destroyed).to.be(false);

      await client1.unregisterP2pTarget();

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
    it('a new stream should be created every time P2P_REGISTER_STREAM is fired', async function () {
      let duplex2a, duplex2b;
      expect(await client1.registerP2pTarget(client2Id)).to.be(true);
      client2.onRegisterP2pStream({}, d => duplex2a = d);
      await client1.registerP2pStream({});
      client2.onRegisterP2pStream({}, d => duplex2b = d);
      await client1.registerP2pStream({});

      expect(duplex2a == duplex2b).to.be(false);
    });
  })
})
