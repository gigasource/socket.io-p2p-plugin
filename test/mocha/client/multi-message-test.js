const expect = require('expect.js');
const {startClient, generateClientIds, wait, terminateClients} = require('../common');
const {SOCKET_EVENT} = require('../../../src/util/constants');
const P2pMultiApi = require('../../../src/api/client/message/multi');

describe('Multi Message API', function () {
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
    it('should listen to MULTI_API_TARGET_DISCONNECT event', function () {
      expect(client1.listeners(SOCKET_EVENT.MULTI_API_TARGET_DISCONNECT)).to.have.length(1);
    });
  })
  describe('addP2pTarget function', function () {
    it('should trigger onAddP2pTarget on peers', function (done) {
      client2.onAddP2pTarget(sourceClientId => {
        expect(sourceClientId).to.be(client1Id);
        done();
      });

      client1.addP2pTarget(client2Id);
    });
    it('should allow adding multiple target', function (done) {
      let i = 0;

      client2.onAddP2pTarget(sourceClientId => {
        expect(sourceClientId).to.be(client1Id);
        if (++i === 3) done();
      });

      client3.onAddP2pTarget(sourceClientId => {
        expect(sourceClientId).to.be(client1Id);
        if (++i === 3) done();
      });

      client4.onAddP2pTarget(sourceClientId => {
        expect(sourceClientId).to.be(client1Id);
        if (++i === 3) done();
      });

      client1.addP2pTarget(client2Id);
      client1.addP2pTarget(client3Id);
      client1.addP2pTarget(client4Id);
    });
  })
  describe('onAddP2pTarget function', function () {
    it('should be able to handle multiple clients', function (done) {
      let i = 0;
      let sourceClientIds = [];

      client4.onAddP2pTarget(sourceClientId => {
        sourceClientIds.push(sourceClientId);
        if (++i === 3) {
          expect(sourceClientIds).to.have.length(3);
          expect(sourceClientIds).to.contain(client1Id);
          expect(sourceClientIds).to.contain(client2Id);
          expect(sourceClientIds).to.contain(client3Id);
          done();
        }
      });

      client1.addP2pTarget(client4Id);
      client2.addP2pTarget(client4Id);
      client3.addP2pTarget(client4Id);
    });
  })
  describe('from function', function () {
    it('should return object of type P2pMultiApi', function () {
      expect(client1.from(client2) instanceof P2pMultiApi).to.be(true);
    });
  })
  describe('on function', function () {
    it('should be able to receive data without adding target process', function (done) {
      const dataToSend1 = 'test payload 1';
      const dataToSend2 = 'test payload 2';
      const dataToSend3 = 'test payload 3';
      const eventName = 'testEvent';

      client2.from(client1Id).on(eventName, (data1, data2, data3) => {
        expect(data1).to.be(dataToSend1);
        expect(data2).to.be(dataToSend2);
        expect(data3).to.be(dataToSend3);
        done();
      });

      client1.emitTo(client2Id, eventName, dataToSend1, dataToSend2, dataToSend3);
    });
    it('should be able to receive data from multiple targets', function (done) {
      const dataToSend1 = 'test payload 1';
      const dataToSend2 = 'test payload 2';
      const dataToSend3 = 'test payload 3';
      const eventName = 'testEvent';
      let i = 0;
      let result1, result2, result3 = 'result';

      const verify = () => {
        expect(result1).to.be(dataToSend1);
        expect(result2).to.be(dataToSend2);
        expect(result3).to.be(dataToSend3);
        done();
      };

      client4.from(client1Id).on(eventName, arg => {
        result1 = arg;
        if (++i === 3) verify();
      });

      client4.from(client2Id).on(eventName, arg => {
        result2 = arg;
        if (++i === 3) verify();
      });

      client4.from(client3Id).on(eventName, arg => {
        result3 = arg;
        if (++i === 3) verify();
      });

      client1.emitTo(client4Id, eventName, dataToSend1);
      client2.emitTo(client4Id, eventName, dataToSend2);
      client3.emitTo(client4Id, eventName, dataToSend3);
    });
    it('should create listeners with "eventName-from-clientId" format', function () {
      const eventName = 'testEvent';

      client2.from(client1Id).on(eventName, () => {
      });

      expect(client2.listeners(`${eventName}`)).to.have.length(0);
      expect(client2.listeners(`${eventName}-from-${client1Id}`)).to.have.length(1);
    });
  })
  describe('emitTo function', function () {
    it('should be able to send data to correct target', function (done) {
      const eventName = 'testEvent';
      const payload1 = 'test-data-1';
      const payload2 = 'test-data-2';
      let result1 = 'result-1';

      client3.from(client1Id).on(eventName, arg => {
        result1 = arg;
      });

      client4.from(client1Id).on(eventName, () => result1 = null); // this should have no impact on the result

      client1.emitTo(client3Id, eventName, payload1);
      client2.emitTo(client3Id, eventName, payload2); // this should have no impact on the result
      setTimeout(() => {
        expect(result1).to.be(payload1);
        done()
      }, 1000);
    });
    it('should be able to send data with acknowledgement function', function (done) {
      const eventName = 'testEvent';
      const payload = 'test-data-1';
      const ackPayload = 'ack-data-1';
      let result1 = 'result-1';
      let result2 = 'result-2';

      client2.from(client1Id).on(eventName, (payload, ackFn) => {
        result1 = payload;
        ackFn(ackPayload);
      });

      client1.emitTo(client2Id, eventName, payload, ackData => {
        result2 = ackData;
        expect(result1).to.be(payload);
        expect(result2).to.be(ackPayload);
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

        client1.addP2pTarget(client3Id);
        client1.addP2pTarget(client4Id);
        client2.addP2pTarget(client3Id);
        client2.addP2pTarget(client4Id);

        const originalLength1 = Object.keys(client3._callbacks).length;
        const originalLength2 = Object.keys(client4._callbacks).length;

        setTimeout(() => {
          expect(client3.listeners(`${eventName1}-from-${client1Id}`)).to.have.length(3);
          expect(client3.listeners(`${eventName2}-from-${client1Id}`)).to.have.length(1);
          expect(client3.listeners(`${eventName3}-from-${client1Id}`)).to.have.length(1);

          expect(client3.listeners(`${eventName1}-from-${client2Id}`)).to.have.length(3);
          expect(client3.listeners(`${eventName2}-from-${client2Id}`)).to.have.length(1);
          expect(client3.listeners(`${eventName3}-from-${client2Id}`)).to.have.length(1);

          expect(client4.listeners(`${eventName1}-from-${client1Id}`)).to.have.length(1);
          expect(client4.listeners(`${eventName2}-from-${client1Id}`)).to.have.length(1);

          expect(client4.listeners(`${eventName1}-from-${client2Id}`)).to.have.length(1);
          expect(client4.listeners(`${eventName2}-from-${client2Id}`)).to.have.length(1);
          expect(Object.keys(client3._callbacks)).to.have.length(originalLength1 + 6);
          expect(Object.keys(client4._callbacks)).to.have.length(originalLength2 + 4);
          client1.disconnect();
        }, 100);

        setTimeout(() => {
          expect(client3.listeners(`${eventName1}-from-${client1Id}`)).to.have.length(0);
          expect(client3.listeners(`${eventName2}-from-${client1Id}`)).to.have.length(0);
          expect(client3.listeners(`${eventName3}-from-${client1Id}`)).to.have.length(0);

          expect(client3.listeners(`${eventName1}-from-${client2Id}`)).to.have.length(3);
          expect(client3.listeners(`${eventName2}-from-${client2Id}`)).to.have.length(1);
          expect(client3.listeners(`${eventName3}-from-${client2Id}`)).to.have.length(1);

          expect(client4.listeners(`${eventName1}-from-${client1Id}`)).to.have.length(0);
          expect(client4.listeners(`${eventName2}-from-${client1Id}`)).to.have.length(0);

          expect(client4.listeners(`${eventName1}-from-${client2Id}`)).to.have.length(1);
          expect(client4.listeners(`${eventName2}-from-${client2Id}`)).to.have.length(1);
          expect(Object.keys(client3._callbacks)).to.have.length(originalLength1 + 3);
          expect(Object.keys(client4._callbacks)).to.have.length(originalLength2 + 2);
          client2.disconnect();
        }, 200);

        setTimeout(() => {
          expect(client3.listeners(`${eventName1}-from-${client1Id}`)).to.have.length(0);
          expect(client3.listeners(`${eventName2}-from-${client1Id}`)).to.have.length(0);
          expect(client3.listeners(`${eventName3}-from-${client1Id}`)).to.have.length(0);

          expect(client3.listeners(`${eventName1}-from-${client2Id}`)).to.have.length(0);
          expect(client3.listeners(`${eventName2}-from-${client2Id}`)).to.have.length(0);
          expect(client3.listeners(`${eventName3}-from-${client2Id}`)).to.have.length(0);

          expect(client4.listeners(`${eventName1}-from-${client1Id}`)).to.have.length(0);
          expect(client4.listeners(`${eventName2}-from-${client1Id}`)).to.have.length(0);

          expect(client4.listeners(`${eventName1}-from-${client2Id}`)).to.have.length(0);
          expect(client4.listeners(`${eventName2}-from-${client2Id}`)).to.have.length(0);
          expect(Object.keys(client3._callbacks)).to.have.length(originalLength1);
          expect(Object.keys(client4._callbacks)).to.have.length(originalLength2);
          done();
        }, 300);
      });
    })
  })
})
