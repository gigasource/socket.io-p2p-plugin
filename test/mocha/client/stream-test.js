const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;
const {Duplex} = require('stream');
const {startServer, stopServer, startClients, wait, terminateClients} = require('../common');
const {SOCKET_EVENT} = require('../../../src/util/constants');
const streamify = require('stream-array');
chai.use(chaiAsPromised);

describe('Client Stream API', function () {
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

  /* deprecated
  describe('constructor', function () {
    it('should listen to CREATE_STREAM event', async function () {
      expect(client1.listeners(SOCKET_EVENT.CREATE_STREAM)).to.have.lengthOf(1);
    });
  });*/

  describe('addP2pStream function', function () {
    /* deprecated
    it('should throw error if peer is not listening to add stream event', function () {
      return expect(client2.addP2pStream(client1.clientId, {})).to.be.rejected;
    });*/
    it('should return a Duplex if peer is listening to add stream event', async function () {
      client2.onAddP2pStream();
      const duplex = await client1.addP2pStream(client2.clientId, {});
      expect(duplex instanceof Duplex).to.equal(true);
    });
    it('should transfer data to correct channel', async function () {
      const channel1 = 'channel1';
      const channel2 = 'random-channel-2';

      let result1 = [];
      let result2 = [];

      let input1 = [...new Array(40)].map(() => Math.round(Math.random() * 100) + '1');
      let input2 = [...new Array(50)].map(() => Math.round(Math.random() * 100) + '2');

      expect(JSON.stringify(input1)).to.not.equal(JSON.stringify(input2));

      const channel1Handler = function (duplex1) {
        duplex1.on('data', chunk => result1.push(chunk.toString()));
      }

      const channel2Handler = function (duplex2) {
        duplex2.on('data', chunk => result2.push(chunk.toString()));
      }

      // NOTE: only 1 handler will be run -> only 1 handler for 1 channel
      client2.onAddP2pStream(channel1, channel1Handler);
      client2.onAddP2pStream(channel1, channel1Handler);
      client2.onAddP2pStream(channel1, channel1Handler);
      client2.onAddP2pStream(channel2, channel2Handler);
      client2.onAddP2pStream(channel2, channel2Handler);

      expect(client2.listeners(SOCKET_EVENT.CREATE_STREAM).length).to.equal(0);
      expect(client2.listeners(`${SOCKET_EVENT.CREATE_STREAM}-CHANNEL-${channel1}`).length).to.equal(1);
      expect(client2.listeners(`${SOCKET_EVENT.CREATE_STREAM}-CHANNEL-${channel2}`).length).to.equal(1);

      const channel1Duplex = await client1.addP2pStream(client2.clientId, channel1);
      const channel2Duplex = await client1.addP2pStream(client2.clientId, channel2);

      streamify(input1).pipe(channel1Duplex);
      streamify(input2).pipe(channel2Duplex);

      await wait(200);

      expect(result1).to.have.lengthOf(input1.length);
      expect(result2).to.have.lengthOf(input2.length);
      expect(result1[0]).to.equal(input1[0]);
      expect(result2[0]).to.equal(input2[0]);
      expect(result1[result1.length - 1]).to.equal(input1[result1.length - 1]);
      expect(result2[result2.length - 1]).to.equal(input2[result2.length - 1]);
    });
  });
  describe('onAddP2pStream function', function () {
    /* deprecated
    it('should remove default listener from constructor', async function () {
      let initialListener, newListener;

      expect(client2.listeners(SOCKET_EVENT.CREATE_STREAM)).to.have.lengthOf(1);
      initialListener = client2.listeners(SOCKET_EVENT.CREATE_STREAM)[0];
      newListener = client2.listeners(SOCKET_EVENT.CREATE_STREAM)[0];

      expect(initialListener === newListener).to.equal(true);

      client2.onAddP2pStream({}, () => {
      });
      expect(client2.listeners(SOCKET_EVENT.CREATE_STREAM)).to.have.lengthOf(1);
      newListener = client2.listeners(SOCKET_EVENT.CREATE_STREAM)[0];

      expect(initialListener === newListener).to.equal(false);
    });*/
    it('should remove old listeners if called more than once', function () {
      client2.onAddP2pStream({}, () => {
      });
      client2.onAddP2pStream({}, () => {
      });
      client2.onAddP2pStream({}, () => {
      });

      expect(client2.listeners(SOCKET_EVENT.CREATE_STREAM).length).to.equal(1);
    });
    it('should return a Duplex', function (done) {
      client2.onAddP2pStream({}, (duplex) => {
        expect(duplex instanceof Duplex).to.equal(true);
        done();
      });

      client1.addP2pStream(client2.clientId, {}, () => {
      });
    });
  })
  describe('the returned Duplex', function () {
    it('should listen to \'error\' event', async function () {
      client2.onAddP2pStream();
      const duplex = await client1.addP2pStream(client2.clientId, {});
      expect(duplex._events.error instanceof Function).to.equal(true);
    });
    it('should be destroyable & remove related listeners on destroyed', async function () {
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
      expect(client1.listeners(sendDataEvent1)).to.have.lengthOf(1);
      expect(client2.listeners(sendDataEvent2)).to.have.lengthOf(1);
      expect(client1.listeners(SOCKET_EVENT.PEER_STREAM_DESTROYED)).to.have.lengthOf(1);
      expect(client2.listeners(SOCKET_EVENT.PEER_STREAM_DESTROYED)).to.have.lengthOf(1);

      duplex.destroy();
      await wait(50);

      expect(duplex.destroyed).to.equal(true);

      expect(client1.listeners('disconnect')).to.have.lengthOf(originalCount1);
      expect(client2.listeners('disconnect')).to.have.lengthOf(originalCount1);
      expect(client1.listeners(SOCKET_EVENT.TARGET_DISCONNECT)).to.have.lengthOf(originalCount2);
      expect(client2.listeners(SOCKET_EVENT.TARGET_DISCONNECT)).to.have.lengthOf(originalCount2);
      expect(client1.listeners(sendDataEvent1)).to.have.lengthOf(0);
      expect(client2.listeners(sendDataEvent2)).to.have.lengthOf(0);
      expect(client1.listeners(SOCKET_EVENT.PEER_STREAM_DESTROYED)).to.have.lengthOf(0);
      expect(client2.listeners(SOCKET_EVENT.PEER_STREAM_DESTROYED)).to.have.lengthOf(0);
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
    it('should send data to correct target', async function () {
      let duplex1, duplex2, duplex3, duplex4;
      const result1 = [];
      const result2 = [];

      client3.onAddP2pStream({}, d => duplex3 = d);
      client4.onAddP2pStream({}, d => duplex4 = d);

      // 1b - 4 will be connected because 1b is called last -> duplex4 = target duplex of 1b
      duplex1 = await client1.addP2pStream(client3.clientId, {});
      duplex2 = await client1.addP2pStream(client4.clientId, {});

      const input1 = ['1', 'a', 'client'];
      const input2 = [3, 3, 3, 3].map(e => e.toString());

      duplex3.on('data', chunk => result1.push(chunk.toString()));
      duplex4.on('data', chunk => result2.push(chunk.toString()));

      streamify(input1).pipe(duplex1);
      streamify(input2).pipe(duplex2);

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
    it('should allow both ends to add stream', async function () {
      client2.onAddP2pStream();
      const duplex1 = await client1.addP2pStream(client2.clientId, {});
      expect(duplex1 instanceof Duplex).to.equal(true);

      client1.onAddP2pStream();
      const duplex2 = await client2.addP2pStream(client1.clientId, {});
      expect(duplex2 instanceof Duplex).to.equal(true);

      expect(duplex1 === duplex2).to.equal(false);
    });
    it('should be able to send last chunk of data with .end()', function (done) {
      let count = 0;

      client2.onAddP2pStream((targetDuplex) => {
        let result;

        targetDuplex.on('data', (data) => {
          if (data) result = +data.toString();
        });

        targetDuplex.on('end', () => {
          expect(result).to.equal(2);
          expect(count).to.equal(2);
          done();
        });
      });

      client1.addP2pStream(client2.clientId, async (sourceDuplex) => {
        await wait(50);
        count++;
        sourceDuplex.write('randomData');
        await wait(100);
        count++;
        sourceDuplex.end(`${count}`);
      });
    });
    it('should trigger .end() callback after "end" event and before "finish" event', function (done) {
      let count = 0;

      client2.onAddP2pStream((targetDuplex) => {
        let result;

        targetDuplex.on('data', (data) => {
          if (data) result = +data.toString();
        });

        targetDuplex.on('end', () => {
          expect(result).to.equal(2);
          expect(count).to.equal(2);
        });
      });

      client1.addP2pStream(client2.clientId, async (sourceDuplex) => {
        sourceDuplex.on('finish', () => {
          count++;
          expect(count).to.equal(4);
          done();
        })

        await wait(50);
        count++;
        sourceDuplex.write('randomData');
        await wait(100);
        count++;
        sourceDuplex.end(`${count}`, 'utf8', () => {
          count++;
          expect(count).to.equal(3);
        });
      });
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
    it('should emit "close" event on both streams when destroyed', function (done) {
      let result = '';

      client2.onAddP2pStream((targetDuplex) => {
        targetDuplex.on('close', () => {
          result += 'B';
          expect(result).to.equal('AB');
          done();
        });
      });

      client1.addP2pStream(client2.clientId, async (sourceDuplex) => {
        sourceDuplex.on('close', () => {
          result += 'A';
        });

        await wait(50); // wait for target duplex to be created
        sourceDuplex.destroy();
      });
    });
    it('should emit "finish" event when .end() is called and target acknowledges .end() call', function (done) {
      const dataToTransfer = 'abc';

      client2.onAddP2pStream((targetDuplex) => {
        targetDuplex.on('data', (data) => {
          expect(data.toString()).to.equal(dataToTransfer);
        });
      });

      client1.addP2pStream(client2.clientId, async (sourceDuplex) => {
        sourceDuplex.on('finish', () => {
          // will be triggered when '.end()' is called
          done();
        });

        await wait(50);
        sourceDuplex.write(dataToTransfer)
        await wait(100);
        sourceDuplex.end();
      });
    });
    it('should emit "end" event when peer stream calls .end()', function (done) {
      let count = 0;

      client2.onAddP2pStream((targetDuplex) => {
        targetDuplex.on('end', () => {
          // will be triggered when peer stream calls '.end()'
          expect(count).to.equal(2);
          done();
        });
      });

      client1.addP2pStream(client2.clientId, async (sourceDuplex) => {
        await wait(50);
        count++;
        sourceDuplex.write('randomData');
        await wait(100);
        count++;
        sourceDuplex.end();
      });
    });
  });
})
