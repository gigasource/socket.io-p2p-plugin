const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;
const {startServer, stopServer, startClients, wait, terminateClients} = require('../common');
chai.use(chaiAsPromised);

describe('Client Message API', function () {
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

  describe('addP2pTarget function', function () {
    it('should trigger onAddP2pTarget on peers', function (done) {
      client2.onAddP2pTarget(sourceClientId => {
        expect(sourceClientId).to.equal(client1.clientId);
        done();
      });

      client1.addP2pTarget(client2.clientId);
    });
    it('should throw error if target is not registered to server', function () {
      return expect(client1.addP2pTarget('invalidId')).to.be.rejected;
    });
    it('should allow adding multiple targets', function (done) {
      let result = 0;
      let i = 0;

      const verify = () => {
        if (++i === 3) {
          expect(result).to.equal(111);
          done();
        }
      }

      client2.onAddP2pTarget(sourceClientId => {
        expect(sourceClientId).to.equal(client1.clientId);
        result += 1;
        verify();
      });

      client3.onAddP2pTarget(sourceClientId => {
        expect(sourceClientId).to.equal(client1.clientId);
        result += 10;
        verify();
      });

      client4.onAddP2pTarget(sourceClientId => {
        expect(sourceClientId).to.equal(client1.clientId);
        result += 100;
        verify();
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

  describe('emitTo function', function () {
    it('should send data to correct target', async function () {
      const eventName = 'testEvent';
      const payload = 'test-data-1';
      let result = 'result-1';

      client3.on(eventName, arg => result = arg);
      client4.on(eventName, () => result = null); // this should have no impact on the result

      client1.emitTo(client3.clientId, eventName, payload);
      await wait(200);
      expect(result).to.equal(payload);
    });
    it('should be able to send data with acknowledgement function', function (done) {
      const eventName = 'testEvent';
      const payload = 'test-data-1';
      const ackPayload = 'ack-data-1';
      let result1 = 'result-1';
      let result2 = 'result-2';

      client2.on(eventName, (payload, ackFn) => {
        result1 = payload;
        ackFn(ackPayload);
      });

      client1.emitTo(client2.clientId, eventName, payload, ackData => {
        result2 = ackData;
        expect(result1).to.equal(payload);
        expect(result2).to.equal(ackPayload);
        done();
      });
    });
  });

  describe('onP2pTargetDisconnect callbacks', function () {
    it('should be called only if target client was added beforehand', async function () {
      let peerDisconnectCount = 0;
      let disconnectedClientId = null;

      client1.addP2pTarget(client2.clientId);
      client1.onP2pTargetDisconnect(targetClientId => {
        peerDisconnectCount++;
        disconnectedClientId = targetClientId
      });

      client2.disconnect(); // only client1 & client2 are connected (by using addP2pTarget)
      client3.disconnect();
      client4.disconnect();

      await wait(200);

      expect(peerDisconnectCount).to.equal(1);
      expect(disconnectedClientId).to.equal(client2.clientId);
    });
  });
})
