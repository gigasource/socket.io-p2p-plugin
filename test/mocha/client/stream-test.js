const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;
const {Duplex} = require('stream');
const {startServer, stopServer, startClients, wait, terminateClients} = require('../common');
const {SOCKET_EVENT} = require('../../../src/util/constants');
const streamify = require('stream-array');
chai.use(chaiAsPromised);

describe('stream API for p2p-client-plugin', function () {
  const numberOfClients = 4;
  let client1, client2, client3, client4;

  before(async function () {
    startServer();
  });

  after(function () {
    stopServer();
  });

  beforeEach(async function () {
    [client1, client2, client3, client4] = startClients(numberOfClients);
    await wait(50);
  });

  afterEach(async function () {
    terminateClients(client1, client2, client3, client4);
    await wait(50);
  });

  describe('constructor', function () {
    it('should create a MULTI_API_CREATE_STREAM to refuse connection attempt', async function () {
      expect(client1.listeners(SOCKET_EVENT.CREATE_STREAM)).to.have.lengthOf(1);
    });
  })

  describe('addP2pStream function', function () {
    it('should throw error if peer is not listening to add stream event', async function () {
      return expect(client2.addP2pStream(client1.clientId, {})).to.be.rejected;
    });
    it('should return a Duplex if peer is listening to add stream event', async function () {
      client2.onAddP2pStream();
      const duplex = await client1.addP2pStream(client2.clientId, {});
      expect(duplex instanceof Duplex).to.equal(true);
    });
  });
  describe('onAddP2pStream function', function () {
    it('should remove default listener from constructor', async function () {
      let initialListener, newListener;

      expect(client2.listeners(SOCKET_EVENT.CREATE_STREAM)).to.have.lengthOf(1);
      initialListener = client2.listeners(SOCKET_EVENT.CREATE_STREAM)[0];
      newListener = client2.listeners(SOCKET_EVENT.CREATE_STREAM)[0];

      expect(initialListener === newListener).to.equal(true);

      client2.onAddP2pStream({}, () => {});
      expect(client2.listeners(SOCKET_EVENT.CREATE_STREAM)).to.have.lengthOf(1);
      newListener = client2.listeners(SOCKET_EVENT.CREATE_STREAM)[0];

      expect(initialListener === newListener).to.equal(false);
    });
    it('should remove old listeners if called more than once', function () {
      client2.onAddP2pStream({}, d => {});
      client2.onAddP2pStream({}, d => {});
      client2.onAddP2pStream({}, d => {});

      expect(client2.listeners(SOCKET_EVENT.CREATE_STREAM).length).to.equal(1);
    });
    it('should return a Duplex', function (done) {
      client2.onAddP2pStream({}, (duplex) => {
        expect(duplex instanceof Duplex).to.equal(true);
        done();
      });
      client1.addP2pStream(client2.clientId, {});
    });
  })
  describe('the returned Duplex', function () {
    it('should listen to \'error\' event', async function () {
      client2.onAddP2pStream();
      const duplex = await client1.addP2pStream(client2.clientId, {});
      expect(duplex._events.error instanceof Function).to.equal(true);
    });
    it('should be destroyable (+ remove related listeners on destroyed)', async function () {
      const originalCount1 = client1.listeners('disconnect').length;
      const originalCount2 = client1.listeners(SOCKET_EVENT.TARGET_DISCONNECT).length;
      let sendDataEvent1, sendDataEvent2;

      client2.onAddP2pStream({}, d => {
        sendDataEvent2 = `${SOCKET_EVENT.P2P_EMIT_STREAM}${SOCKET_EVENT.STREAM_IDENTIFIER_PREFIX}${d.targetStreamId}`;
      });
      const duplex = await client1.addP2pStream(client2.clientId, {});

      sendDataEvent1 = `${SOCKET_EVENT.P2P_EMIT_STREAM}${SOCKET_EVENT.STREAM_IDENTIFIER_PREFIX}${duplex.targetStreamId}`;

      expect(client1.listeners('disconnect')).to.have.lengthOf(originalCount1 + 1);
      expect(client2.listeners('disconnect')).to.have.lengthOf(originalCount1 + 1);
      expect(client1.listeners(SOCKET_EVENT.TARGET_DISCONNECT)).to.have.lengthOf(originalCount2 + 1);
      expect(client2.listeners(SOCKET_EVENT.TARGET_DISCONNECT)).to.have.lengthOf(originalCount2 + 1);
      expect(client1.listeners(sendDataEvent1)).to.have.lengthOf( 1);
      expect(client2.listeners(sendDataEvent2)).to.have.lengthOf( 1);
      expect(client1.listeners(SOCKET_EVENT.PEER_STREAM_DESTROYED)).to.have.lengthOf( 1);
      expect(client2.listeners(SOCKET_EVENT.PEER_STREAM_DESTROYED)).to.have.lengthOf( 1);

      duplex.destroy();
      await wait(50);

      expect(duplex.destroyed).to.equal(true);

      expect(client1.listeners('disconnect')).to.have.lengthOf(originalCount1);
      expect(client2.listeners('disconnect')).to.have.lengthOf(originalCount1);
      expect(client1.listeners(SOCKET_EVENT.TARGET_DISCONNECT)).to.have.lengthOf(originalCount2);
      expect(client2.listeners(SOCKET_EVENT.TARGET_DISCONNECT)).to.have.lengthOf(originalCount2);
      expect(client1.listeners(sendDataEvent1)).to.have.lengthOf( 0);
      expect(client2.listeners(sendDataEvent2)).to.have.lengthOf( 0);
      expect(client1.listeners(SOCKET_EVENT.PEER_STREAM_DESTROYED)).to.have.lengthOf( 0);
      expect(client2.listeners(SOCKET_EVENT.PEER_STREAM_DESTROYED)).to.have.lengthOf( 0);
    });
    it('should be able to transfer data to target client when connected', async function () {
      let duplex1, duplex2;
      const result = [];
      client2.onAddP2pStream({}, d => duplex2 = d);
      duplex1 = await client1.addP2pStream(client2.clientId, {});

      duplex2.on('data', chunk => result.push(chunk.toString()));
      const inputArr = [...new Array(40)].map(() => Math.round(Math.random() * 100) + '');
      streamify(inputArr).pipe(duplex1);

      await wait(200);
      expect(result).to.have.lengthOf(inputArr.length);
      expect(result[0]).to.equal(inputArr[0]);
      expect(result[result.length - 1]).to.equal(inputArr[result.length - 1]);
    });
    it('should not send data to wrong target', async function () {
      let duplex1a, duplex1b, duplex3, duplex4;
      const result = [];

      client4.onAddP2pStream({}, d => duplex4 = d);

      // 1b - 4 will be connected because 1b is called last -> duplex4 = target duplex of 1b
      duplex1a = await client1.addP2pStream(client4.clientId, {});
      duplex3 = await client3.addP2pStream(client4.clientId, {});
      duplex1b = await client1.addP2pStream(client4.clientId, {});

      const input1a = ['1', 'a', 'client'];
      const input1b = [2, 3, 4, 5, 6].map(e => e.toString());
      const input3 = [3, 3, 3, 3].map(e => e.toString());

      duplex4.on('data', chunk => result.push(chunk.toString()));
      streamify(input1a).pipe(duplex1a);
      streamify(input1b).pipe(duplex1b);
      streamify(input3).pipe(duplex3);

      await wait(200);
      expect(result).to.have.lengthOf(input1b.length);
      expect(result[0]).to.equal(input1b[0]);
      expect(result[result.length - 1]).to.equal(input1b[result.length - 1]);
    });
    it('should not suppress the throwing behavior of \'error\' events (throw the error to system)', async function () {
      client2.onAddP2pStream();
      const duplex1 = await client1.addP2pStream(client2.clientId, {});

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

      process.nextTick(() => duplex1.emit('error', new Error('Test error message')));
      await result;
    });
    it('should handle back pressure', async function () {
      console.log('this test will take about 10 seconds');
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
    it('should allow both ends to add stream', async function () {
      client2.onAddP2pStream();
      const duplex1 = await client1.addP2pStream(client2.clientId, {});
      expect(duplex1 instanceof Duplex).to.equal(true);

      client1.onAddP2pStream();
      const duplex2 = await client2.addP2pStream(client1.clientId, {});
      expect(duplex2 instanceof Duplex).to.equal(true);

      expect(duplex1 === duplex2).to.equal(false);
    });
  });
  describe('duplex lifecycle', function () {
    it('should be destroyed on error', async function () {
      client2.onAddP2pStream();
      const duplex1 = await client1.addP2pStream(client2.clientId, {});
      expect(duplex1.destroyed).to.equal(false);
      expect(duplex1.emit.bind(duplex1, 'error', new Error('test'))).to.throw();
      expect(duplex1.destroyed).to.equal(true);
    });
    it('should be destroyed on disconnecting (must work similarly on both ends, source & target)', async function () {
      let duplex2, duplex4;
      client2.onAddP2pStream({}, d => duplex2 = d);
      client4.onAddP2pStream({}, d => duplex4 = d);
      const duplex1 = await client1.addP2pStream(client2.clientId, {});
      const duplex3 = await client3.addP2pStream(client4.clientId, {});

      expect(duplex1.destroyed).to.equal(false);
      expect(duplex2.destroyed).to.equal(false);
      expect(duplex3.destroyed).to.equal(false);
      expect(duplex4.destroyed).to.equal(false);

      client1.disconnect();
      await wait(50);

      expect(duplex1.destroyed).to.equal(true);
      expect(duplex2.destroyed).to.equal(true);
      expect(duplex3.destroyed).to.equal(false);
      expect(duplex4.destroyed).to.equal(false);

      client3.disconnect();
      await wait(50);

      expect(duplex1.destroyed).to.equal(true);
      expect(duplex2.destroyed).to.equal(true);
      expect(duplex3.destroyed).to.equal(true);
      expect(duplex4.destroyed).to.equal(true);
    });
    it('should be destroyed if peer stream is destroyed', async function () {
      let duplex1, duplex2;

      client2.onAddP2pStream({}, d => duplex2 = d);
      duplex1 = await client1.addP2pStream(client2.clientId, {});
      expect(duplex1.destroyed).to.equal(false);
      expect(duplex2.destroyed).to.equal(false);

      duplex2.destroy();
      await wait(50);
      expect(duplex1.destroyed).to.equal(true);
      expect(duplex2.destroyed).to.equal(true);
    });
    it('a new duplex should be created every time addP2pStream is used', async function () {
      let duplex2a, duplex2b, duplex2c, duplex2d;
      client2.onAddP2pStream({}, d => duplex2a = d);
      duplex2c = await client1.addP2pStream(client2.clientId, {});
      client2.onAddP2pStream({}, d => duplex2b = d);
      duplex2d = await client1.addP2pStream(client2.clientId, {});

      expect(duplex2a === duplex2b).to.equal(false);
      expect(duplex2c === duplex2d).to.equal(false);
    });
    it('should remove listeners on disconnection/target disconnection', async function () {
      const originalDisconnectListenerCount = client1.listeners('disconnect').length;
      const originalTargetDisconnectListenerCount = client1.listeners(SOCKET_EVENT.TARGET_DISCONNECT).length;
      let duplex2, duplex3, duplex4;

      client2.onAddP2pStream();
      client3.onAddP2pStream();
      client4.onAddP2pStream();

      duplex2 = await client1.addP2pStream(client2.clientId, {});
      duplex3 = await client1.addP2pStream(client3.clientId, {});
      duplex4 = await client1.addP2pStream(client4.clientId, {});

      // events we need to check in client 1
      const duplexSendDataEvent2 = `${SOCKET_EVENT.P2P_EMIT_STREAM}${SOCKET_EVENT.STREAM_IDENTIFIER_PREFIX}${duplex2.targetStreamId}`;
      const duplexSendDataEvent3 = `${SOCKET_EVENT.P2P_EMIT_STREAM}${SOCKET_EVENT.STREAM_IDENTIFIER_PREFIX}${duplex3.targetStreamId}`;
      const duplexSendDataEvent4 = `${SOCKET_EVENT.P2P_EMIT_STREAM}${SOCKET_EVENT.STREAM_IDENTIFIER_PREFIX}${duplex4.targetStreamId}`;

      // an event we need to check in client 4
      const duplexSendDataEvent4OfClient4 = `${SOCKET_EVENT.P2P_EMIT_STREAM}${SOCKET_EVENT.STREAM_IDENTIFIER_PREFIX}${duplex4.sourceStreamId}`;

      expect(client1.listeners(duplexSendDataEvent2)).to.have.lengthOf(1);
      expect(client1.listeners(duplexSendDataEvent3)).to.have.lengthOf(1);
      expect(client1.listeners(duplexSendDataEvent4)).to.have.lengthOf(1);
      expect(client1.listeners('disconnect')).to.have.lengthOf(originalDisconnectListenerCount + 3);
      expect(client1.listeners(SOCKET_EVENT.TARGET_DISCONNECT)).to.have.lengthOf(originalTargetDisconnectListenerCount + 3);

      client2.disconnect();
      await wait(50);
      expect(client1.listeners(duplexSendDataEvent2)).to.have.lengthOf(0);
      expect(client1.listeners(duplexSendDataEvent3)).to.have.lengthOf(1);
      expect(client1.listeners(duplexSendDataEvent4)).to.have.lengthOf(1);
      expect(client1.listeners('disconnect')).to.have.lengthOf(originalDisconnectListenerCount + 2);
      expect(client1.listeners(SOCKET_EVENT.TARGET_DISCONNECT)).to.have.lengthOf(originalTargetDisconnectListenerCount + 2);

      client3.disconnect();
      await wait(50);
      expect(client1.listeners(duplexSendDataEvent2)).to.have.lengthOf(0);
      expect(client1.listeners(duplexSendDataEvent3)).to.have.lengthOf(0);
      expect(client1.listeners(duplexSendDataEvent4)).to.have.lengthOf(1);
      expect(client1.listeners('disconnect')).to.have.lengthOf(originalDisconnectListenerCount + 1);
      expect(client1.listeners(SOCKET_EVENT.TARGET_DISCONNECT)).to.have.lengthOf(originalTargetDisconnectListenerCount + 1);

      /* client1 (active side) initializes connections to client2, 3, 4 (passive side)
         Previously, we check the disconnection of passive side by disconnecting client 2 & 3
         Now, we also need to check the disconnection of active side by disconnecting client 1 & check the listeners of client 4
         (also need to check client 1 to see if 'disconnect' listener works properly)
      */
      expect(client4.listeners(duplexSendDataEvent4OfClient4)).to.have.lengthOf(1);
      expect(client1.listeners(duplexSendDataEvent4)).to.have.lengthOf(1);
      expect(client4.listeners(SOCKET_EVENT.TARGET_DISCONNECT)).to.have.lengthOf(originalTargetDisconnectListenerCount + 1);
      expect(client1.listeners(SOCKET_EVENT.TARGET_DISCONNECT)).to.have.lengthOf(originalTargetDisconnectListenerCount + 1);
      expect(client4.listeners('disconnect')).to.have.lengthOf(originalDisconnectListenerCount + 1);
      expect(client1.listeners('disconnect')).to.have.lengthOf(originalDisconnectListenerCount + 1);

      client1.disconnect();
      await wait(50);
      expect(client4.listeners(duplexSendDataEvent4OfClient4)).to.have.lengthOf(0);
      expect(client1.listeners(duplexSendDataEvent4)).to.have.lengthOf(0);
      expect(client4.listeners(SOCKET_EVENT.TARGET_DISCONNECT)).to.have.lengthOf(originalTargetDisconnectListenerCount);
      expect(client1.listeners(SOCKET_EVENT.TARGET_DISCONNECT)).to.have.lengthOf(originalTargetDisconnectListenerCount);
      expect(client4.listeners('disconnect')).to.have.lengthOf(originalDisconnectListenerCount);
      expect(client1.listeners('disconnect')).to.have.lengthOf(originalDisconnectListenerCount);
    });
  });
})
