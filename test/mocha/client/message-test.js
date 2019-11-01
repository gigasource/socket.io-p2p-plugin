const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;
const {startServer, stopServer, startClients, wait, terminateClients} = require('../common');
const {SOCKET_EVENT} = require('../../../src/util/constants');
const P2pMultiApi = require('../../../src/api/client/message');
chai.use(chaiAsPromised);

describe('Multi Message API', function () {
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
    await wait(200);
  });

  afterEach(async function () {
    terminateClients(client1, client2, client3, client4);
    await wait(200);
  });

  describe('constructor', function () {
    it('should listen to MULTI_API_TARGET_DISCONNECT event', function () {
      expect(client1.listeners(SOCKET_EVENT.MULTI_API_TARGET_DISCONNECT)).to.have.lengthOf(1);
    });
    it('should listen to SERVER_ERROR event', function () {
      expect(client1.listeners(SOCKET_EVENT.SERVER_ERROR)).to.have.lengthOf(1);
    });
  });
  describe('addP2pTarget function', function () {
    it('should trigger onAddP2pTarget on peers', function (done) {
      client2.onAddP2pTarget(sourceClientId => {
        expect(sourceClientId).to.equal(client1.clientId);
        done();
      });

      client1.addP2pTarget(client2.clientId);
    });
    it('should allow adding multiple target', function (done) {
      let i = 0;

      client2.onAddP2pTarget(sourceClientId => {
        expect(sourceClientId).to.equal(client1.clientId);
        if (++i === 3) done();
      });

      client3.onAddP2pTarget(sourceClientId => {
        expect(sourceClientId).to.equal(client1.clientId);
        if (++i === 3) done();
      });

      client4.onAddP2pTarget(sourceClientId => {
        expect(sourceClientId).to.equal(client1.clientId);
        if (++i === 3) done();
      });

      client1.addP2pTarget(client2.clientId);
      client1.addP2pTarget(client3.clientId);
      client1.addP2pTarget(client4.clientId);
    });
  });
  describe('onAddP2pTarget function', function () {
    it('should be able to handle multiple clients', function (done) {
      let i = 0;
      let sourceClientIds = [];

      client4.onAddP2pTarget(sourceClientId => {
        sourceClientIds.push(sourceClientId);
        if (++i === 3) {
          expect(sourceClientIds).to.have.lengthOf(3);
          expect(sourceClientIds).to.contain(client1.clientId);
          expect(sourceClientIds).to.contain(client2.clientId);
          expect(sourceClientIds).to.contain(client3.clientId);
          done();
        }
      });

      client1.addP2pTarget(client4.clientId);
      client2.addP2pTarget(client4.clientId);
      client3.addP2pTarget(client4.clientId);
    });
  });
  describe('onAny function', function () {
    it('should be able to receive event from any clients', function (done) {
      const event = 'testEvent';
      let count = 0;

      client2.onAny(event, () => {
        count++;

        if (count === 3) done();
      });

      client1.emitTo(client2.clientId, event);
      client3.emitTo(client2.clientId, event);
      client4.emitTo(client2.clientId, event);
    });
  });
  describe('onceAny function', function () {
    it('should only be triggered once', function (done) {
      const event = 'testEvent';
      let count = 0;

      client2.onceAny(event, () => {
        count++;
      });

      client1.emitTo(client2.clientId, event);
      client3.emitTo(client2.clientId, event);
      client4.emitTo(client2.clientId, event);

      setTimeout(() => {
        expect(count).to.equal(1);
        done();
      }, 200);
    });
  });
  describe('offAny function', function () {
    it('should remove listeners of both onAny & onceAny', async function () {
      const event = 'testEvent';
      let count = 0;

      const cb1 = () => count++;
      const cb2 = () => count++;
      const cb3 = () => count++;
      const cb4 = () => count++;

      client2.onAny(event, cb1);
      client2.onAny(event, cb2);
      client2.onceAny(event, cb3);
      client2.onceAny(event, cb4);

      client2.offAny(event, cb1);
      client2.offAny(event, cb3);

      client1.emitTo(client2.clientId, event);
      await wait(50);

      expect(count).to.equal(2);

      client2.offAny(event);
      client1.emitTo(client2.clientId, event);
      await wait(50);

      expect(count).to.equal(2);
    });
  });
  describe('from function', function () {
    it('should return object of type P2pMultiApi', function () {
      expect(client1.from(client2) instanceof P2pMultiApi).to.equal(true);
    });
  })
  describe('on function', function () {
    it('should be able to receive data without onAddP2pTarget', function (done) {
      const dataToSend1 = 'test payload 1';
      const dataToSend2 = 'test payload 2';
      const dataToSend3 = 'test payload 3';
      const eventName = 'testEvent';

      client2.from(client1.clientId).on(eventName, (data1, data2, data3) => {
        expect(data1).to.equal(dataToSend1);
        expect(data2).to.equal(dataToSend2);
        expect(data3).to.equal(dataToSend3);
        done();
      });

      client1.emitTo(client2.clientId, eventName, dataToSend1, dataToSend2, dataToSend3);
    });
    it('should be able to receive data from multiple targets', function (done) {
      const dataToSend1 = 'test payload 1';
      const dataToSend2 = 'test payload 2';
      const dataToSend3 = 'test payload 3';
      const eventName = 'testEvent';
      let i = 0;
      let result1, result2, result3 = 'result';

      const verify = () => {
        expect(result1).to.equal(dataToSend1);
        expect(result2).to.equal(dataToSend2);
        expect(result3).to.equal(dataToSend3);
        done();
      };

      client4.from(client1.clientId).on(eventName, arg => {
        result1 = arg;
        if (++i === 3) verify();
      });

      client4.from(client2.clientId).on(eventName, arg => {
        result2 = arg;
        if (++i === 3) verify();
      });

      client4.from(client3.clientId).on(eventName, arg => {
        result3 = arg;
        if (++i === 3) verify();
      });

      client3.emitTo(client4.clientId, eventName, dataToSend3);
      client1.emitTo(client4.clientId, eventName, dataToSend1);
      client2.emitTo(client4.clientId, eventName, dataToSend2);
    });
  })
  describe('off function', function () {
    describe('without callback parameter', function () {
      it('should remove event listeners of selected target only', function () {
        const event1 = 'event1';
        const event2 = 'event2';

        client1.from(client2.clientId).on(event1, () => {});
        client1.from(client3.clientId).on(event1, () => {});
        client1.from(client3.clientId).on(event2, () => {});

        expect(client1.listeners(event1)).to.have.lengthOf(2);
        expect(client1.listeners(event2)).to.have.lengthOf(1);
        client1.from(client2.clientId).off(event1);
        expect(client1.listeners(event1)).to.have.lengthOf(1);
        expect(client1.listeners(event2)).to.have.lengthOf(1);
        client1.from(client3.clientId).off(event1);
        expect(client1.listeners(event1)).to.have.lengthOf(0);
        expect(client1.listeners(event2)).to.have.lengthOf(1);
      });
    });
    describe('with callback parameter', function () {
      it('should remove correct callback', function () {
        const event1 = 'event1';
        const event2 = 'event2';

        const listener1 = () => {};
        const listener2 = () => {};
        const listener3 = () => {};

        client1.from(client2.clientId).on(event1, listener1);
        client1.from(client3.clientId).on(event1, listener2);
        client1.from(client3.clientId).on(event2, listener3);

        expect(client1.listeners(event1)).to.have.lengthOf(2);
        expect(client1.listeners(event2)).to.have.lengthOf(1);
        client1.from(client2.clientId).off(event1, listener1);
        expect(client1.listeners(event1)).to.have.lengthOf(1);
        expect(client1.listeners(event2)).to.have.lengthOf(1);
        // wrong listener -> should remove nothing
        client1.from(client3.clientId).off(event1, listener1);
        client1.from(client3.clientId).off(event1, listener3);
        client1.from(client3.clientId).off(event2, listener1);
        client1.from(client3.clientId).off(event2, listener2);
        // ----------
        expect(client1.listeners(event1)).to.have.lengthOf(1);
        expect(client1.listeners(event2)).to.have.lengthOf(1);
        client1.from(client3.clientId).off(event1, listener2);
        expect(client1.listeners(event1)).to.have.lengthOf(0);
        expect(client1.listeners(event2)).to.have.lengthOf(1);
      });
    });
  });
  describe('once function', function () {
    it('should only be triggered once', function (done) {
      const event = 'testEvent';
      let count = 0;

      client2.from(client1.clientId).once(event, () => {
        count++;
      });

      client1.emitTo(client2.clientId, event);
      client1.emitTo(client2.clientId, event);
      client1.emitTo(client2.clientId, event);

      setTimeout(() => {
        expect(count).to.equal(1);
        done();
      }, 200);
    });
  });
  describe('emitTo function', function () {
    it('should send data to correct target', async function () {
      const eventName = 'testEvent';
      const payload1 = 'test-data-1';
      const payload2 = 'test-data-2';
      let result1 = 'result-1';

      client3.from(client1.clientId).on(eventName, arg => {
        result1 = arg;
      });

      client4.from(client1.clientId).on(eventName, () => result1 = null); // this should have no impact on the result

      client1.emitTo(client3.clientId, eventName, payload1);
      client2.emitTo(client3.clientId, eventName, payload2); // this should have no impact on the result
      await wait(200);
      expect(result1).to.equal(payload1);
    });
    it('should be able to send data with acknowledgement function', function (done) {
      const eventName = 'testEvent';
      const payload = 'test-data-1';
      const ackPayload = 'ack-data-1';
      let result1 = 'result-1';
      let result2 = 'result-2';

      client2.from(client1.clientId).on(eventName, (payload, ackFn) => {
        result1 = payload;
        ackFn(ackPayload);
      });

      client1.emitTo(client2.clientId, eventName, payload, ackData => {
        result2 = ackData;
        expect(result1).to.equal(payload);
        expect(result2).to.equal(ackPayload);
        done();
      })
    });
  })

  describe('lifecycle', function () {
    describe('when a client disconnects after using addP2pTarget function', function () {
      it('related listeners should be removed from its peer', function (done) {
        const eventName1 = 'test-event-1';
        const eventName2 = 'test-event-2';
        const eventName3 = 'test-event-3';

        client3.onAddP2pTarget(sourceClientId => {
          client3.from(sourceClientId).on(eventName1, () => {});
          client3.from(sourceClientId).on(eventName1, () => {});
          client3.from(sourceClientId).on(eventName1, () => {});
          client3.from(sourceClientId).on(eventName2, () => {});
          client3.from(sourceClientId).on(eventName3, () => {});
        });

        client4.onAddP2pTarget(sourceClientId => {
          client4.from(sourceClientId).on(eventName1, () => {});
          client4.from(sourceClientId).on(eventName2, () => {});
        });

        const originalLength1 = Object.keys(client3._callbacks).length;
        const originalLength2 = Object.keys(client4._callbacks).length;

        client1.addP2pTarget(client3.clientId);
        client1.addP2pTarget(client4.clientId);
        client2.addP2pTarget(client3.clientId);
        client2.addP2pTarget(client4.clientId);

        setTimeout(() => {
          expect(client3.listeners(eventName1)).to.have.lengthOf(6);
          expect(client3.listeners(eventName2)).to.have.lengthOf(2);
          expect(client3.listeners(eventName3)).to.have.lengthOf(2);

          expect(client4.listeners(eventName1)).to.have.lengthOf(2);
          expect(client4.listeners(eventName2)).to.have.lengthOf(2);
          expect(Object.keys(client3._callbacks)).to.have.lengthOf(originalLength1 + 3);
          expect(Object.keys(client4._callbacks)).to.have.lengthOf(originalLength2 + 2);
          client1.disconnect();
        }, 100);

        setTimeout(() => {
          expect(client3.listeners(eventName1)).to.have.lengthOf(3);
          expect(client3.listeners(eventName2)).to.have.lengthOf(1);
          expect(client3.listeners(eventName3)).to.have.lengthOf(1);

          expect(client4.listeners(eventName1)).to.have.lengthOf(1);
          expect(client4.listeners(eventName2)).to.have.lengthOf(1);
          expect(Object.keys(client3._callbacks)).to.have.lengthOf(originalLength1 + 3);
          expect(Object.keys(client4._callbacks)).to.have.lengthOf(originalLength2 + 2);
          client2.disconnect();
        }, 200);

        setTimeout(() => {
          expect(client3.listeners(eventName1)).to.have.lengthOf(0);
          expect(client3.listeners(eventName2)).to.have.lengthOf(0);
          expect(client3.listeners(eventName3)).to.have.lengthOf(0);

          expect(client4.listeners(eventName1)).to.have.lengthOf(0);
          expect(client4.listeners(eventName2)).to.have.lengthOf(0);
          expect(Object.keys(client3._callbacks)).to.have.lengthOf(originalLength1 + 3);
          expect(Object.keys(client4._callbacks)).to.have.lengthOf(originalLength2 + 2);
          //Event is not removed from _callbacks, only listeners ($test-event-1 = Array(0))
          done();
        }, 300);
      });
    })
  })
})
