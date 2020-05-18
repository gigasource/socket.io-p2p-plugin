const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;
const {startServer, stopServer, startClients, wait, terminateClients} = require('../common');
const {SOCKET_EVENT} = require('../../../src/util/constants');
chai.use(chaiAsPromised);

describe('Client Core API', function () {
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
    it('should listen to SERVER_ERROR event', function () {
      expect(client1.listeners(SOCKET_EVENT.SERVER_ERROR)).to.have.lengthOf(1);
    });
  });

  describe('room related functions', function () {
    it('should behave similarly to rooms on server', async function () {
      const room1 = 'android devices';
      const room2 = 'ios devices';
      const testEvent = 'checkDevice';
      let count = 0;
      const expectedResult = 230;

      client1.joinRoom(room1);
      client2.joinRoom(room1);

      client2.joinRoom(room2);
      client3.joinRoom(room2);

      client1.on(testEvent, () => count += 1);
      client2.on(testEvent, () => count += 10);
      client3.on(testEvent, () => count += 100);
      client4.on(testEvent, () => count += 1000);
      await wait(100);

      client1.emitRoom(room1, testEvent); // count = 0 + 10, sender will not receive the event
      client1.emitRoom(room2, testEvent); // count = 10 + 10 + 100, clients outside the room can emit to room
      client4.emitRoom(room2, testEvent); // count = 120 + 10 + 100, clients not in any rooms can emit to room
      await wait(100);

      expect(count).to.equal(230);
    });
  });
})
