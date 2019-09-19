const expect = require('expect.js');
const {Duplex, Readable} = require('stream');
const {SOCKET_EVENT} = require('../../src/util/constants');
const {startClient, generateClientIds, wait, terminateClients} = require('./common');
const {createClientStream} = require('../../src/lib/stream');
const streamToArray = require('stream-to-array');
const streamify = require('stream-array');
const os = require('os');

describe('stream plugin for p2p-client-plugin', function () {
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

  describe('createClientStream function', function () {
    it('should return a Duplex', function () {
      expect(createClientStream(client1) instanceof Duplex).to.be(true);
    });
    it('should passes the options object to the \'Duplex\' constructor', function () {
      const duplex = createClientStream(client1, {
        highWaterMark: 123,
        decodeStrings: false, // default is true
        defaultEncoding: 'test', // default is 'utf8'
        objectMode: true, // default is false
        emitClose: false, // default is true
        autoDestroy: true, // default is false
      });

      const readableState = duplex._readableState;
      const writableState = duplex._writableState;

      expect(readableState.highWaterMark).to.be(123);
      expect(readableState.defaultEncoding).to.be('test');
      expect(readableState.objectMode).to.be(true);
      expect(readableState.emitClose).to.be(false);
      expect(readableState.autoDestroy).to.be(true);

      expect(writableState.highWaterMark).to.be(123);
      expect(writableState.decodeStrings).to.be(false);
      expect(writableState.defaultEncoding).to.be('test');
      expect(writableState.objectMode).to.be(true);
      expect(writableState.emitClose).to.be(false);
      expect(writableState.autoDestroy).to.be(true);
    });
    describe('the returned Duplex', function () {
      it('should listen to \'end\' event', function () {
        const duplex = createClientStream(client1);
        expect(duplex._events.end).to.be.a('function');
      });
      it('should listen to \'error\' event', function () {
        const duplex = createClientStream(client1);
        expect(duplex._events.error).to.be.a('function');
      });
      it('should be destroyable', function () {
        const duplex = createClientStream(client1);
        duplex.destroy();
        expect(duplex.destroyed).to.be(true);
      });
      it('should be destroyed on disconnecting & unregistering (must work similarly on both ends, source & target)', async function () {
        const duplex1 = createClientStream(client1);
        const duplex2 = createClientStream(client2);
        const duplex3 = createClientStream(client3);
        const duplex4 = createClientStream(client4);

        expect(duplex1.destroyed).to.be(false);
        expect(duplex2.destroyed).to.be(false);
        expect(duplex3.destroyed).to.be(false);
        expect(duplex4.destroyed).to.be(false);

        const connectionSuccess12 = await client1.registerP2pTarget(client2Id);
        const connectionSuccess34 = await client3.registerP2pTarget(client4Id);
        expect(connectionSuccess12).to.be(true);
        expect(connectionSuccess34).to.be(true);
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

      it('should be able to transfer data to target client when connected', async function () {
        const duplex1 = createClientStream(client1);
        const duplex2 = createClientStream(client2);
        const connectionSuccess = await client1.registerP2pTarget(client2Id);
        expect(connectionSuccess).to.be(true);

        const input = [...new Array(40)].map(() => Math.round(Math.random() * 100) + '');
        const inputStream = streamify(input);
        inputStream.pipe(duplex1);

        await wait(200);
        streamToArray(duplex2, (err, array) => {
          expect(array.length).to.be(40);
        });
      });
      it('should buffers writes if client is not connected to another client', async function () {
        const duplex1 = createClientStream(client1);
        const duplex2 = createClientStream(client2);
        const input = [...new Array(40)].map(() => Math.round(Math.random() * 100) + '');
        const inputStream = streamify(input);
        inputStream.pipe(duplex1);

        const connectionSuccess = await client1.registerP2pTarget(client2Id);
        expect(connectionSuccess).to.be(true);
        await wait(200);
        streamToArray(duplex2, (err, array) => {
          expect(array.length).to.be(40);
        });
      });
      it('should not suppress the throwing behavior of \'error\' events (throw the error to system)', function (done) {
        const duplex1 = createClientStream(client1);

        expect(process.listenerCount('uncaughtException')).to.be(1);
        const [listener] = process.listeners('uncaughtException');

        process.removeAllListeners('uncaughtException');
        process.once('uncaughtException', (err) => {
          expect(err instanceof Error).to.be(true);
          expect(err.message).to.be('Test error message');
          process.on('uncaughtException', listener);
          done();
        });

        process.nextTick(() => duplex1.emit('error', new Error('Test error message')));
      });
      it('should be destroyed on error', function () {
        const duplex1 = createClientStream(client1);
        expect(duplex1.emit.bind(duplex1, 'error', new Error('test'))).to.throwError();
        expect(duplex1.destroyed).to.be(true);
      });
      it('should handle back pressure', async function () {
        const consumerHighWaterMark = 40;
        const producer = createClientStream(client1);
        const consumer = createClientStream(client2, {
          highWaterMark: consumerHighWaterMark
        });
        const dataToBeSent = new Array(100).fill('W');
        const consumeRate = 10; // 10 bytes/s

        const connectionSuccess = await client1.registerP2pTarget(client2Id);
        expect(connectionSuccess).to.be(true);

        dataToBeSent.forEach(e => producer.write(e));
        await wait(1000);

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
      it('should ensure data integrity in case of bad network connection', function () {
        //TODO: Not yet implemented, need to find a way to test with a bad network connection
      });
      it('should not accumulate memory', async function () {
        // console.log(process.memoryUsage().heapUsed / 1024 / 1024); // in MBs
        //TODO: implement this, need to separate producer & consumer to test
      });
    })
  })
})
