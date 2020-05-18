const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;
const {startServer, stopServer, startClients, wait, terminateClients} = require('../common');
chai.use(chaiAsPromised);

describe('Client Service API', function () {
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

  describe('provideService function', function () {
    it('should allow clients to call created APIs', function (done) {
      const api = 'getSomething';
      const payload = Math.random();

      client3.provideService(api, val => {
        expect(val).to.equal(payload);
        done();
      });

      setTimeout(() => client1.emitService(api, payload), 100);
    });

    it('should have no effects if new API name is duplicate of created API names', async function () {
      const apiName = 'createPost';
      let result = 0;

      client1.provideService(apiName, () => result++);
      client2.provideService(apiName, () => result++);
      await wait(100);

      client3.provideService(apiName, () => result++);
      await wait(100);

      client4.emitService(apiName);
      await wait(100);

      expect(result).to.equal(1);
    });
  });
  describe('destroyService function', function () {
    it('should destroy correct APIs & leave the rest unaffected', async function () {
      const api1 = 'getSomething';
      const api2 = 'createPost';
      const api3 = 'deleteNews';
      let count = 0;

      const cb1 = () => count++;
      const cb2 = () => count += 10;
      const cb3 = () => count += 100;
      const expectedResult = 101;

      client2.provideService(api1, cb1);
      client3.provideService(api2, cb2);
      client4.provideService(api3, cb3);
      await wait(100);

      client2.destroyService(api3, cb1); // should not have any effect
      client3.destroyService(api2, cb1);
      client4.destroyService(api1, cb1); // should not have any effect
      await wait(100);

      client1.emitService(api1);
      client1.emitService(api2);
      client1.emitService(api3);
      await wait(100);

      expect(count).to.equal(expectedResult);
    });
    it('should remove socket.io listeners', async function () {
      const api1 = 'getSomething';
      const api2 = 'createPost';
      const api3 = 'deleteNews';

      client1.provideService(api1, () => null);
      client1.provideService(api2, () => null);
      client1.provideService(api3, () => null);
      await wait(100);
      expect(client1.listeners(api1).length).to.equal(1);
      expect(client1.listeners(api2).length).to.equal(1);
      expect(client1.listeners(api3).length).to.equal(1);

      client1.destroyService(api1);
      client1.destroyService(api2);
      await wait(100);
      expect(client1.listeners(api1).length).to.equal(0);
      expect(client1.listeners(api2).length).to.equal(0);
      expect(client1.listeners(api3).length).to.equal(1);
    });
  });
  describe('destroyAllServices function', function () {
    it('should destroy all APIs of client', async function () {
      const api1 = 'getSomething';
      const api2 = 'createPost';
      const api3 = 'deleteNews';
      let count = 0;

      const cb1 = () => count++;
      const cb2 = () => count += 10;
      const cb3 = () => count += 100;
      const expectedResult = 0;

      client2.provideService(api1, cb1);
      client2.provideService(api2, cb2);
      client2.provideService(api3, cb3);
      await wait(100);

      client2.destroyAllServices();
      await wait(100);

      client1.emitService(api1);
      client1.emitService(api2);
      client1.emitService(api3);
      await wait(100);

      expect(count).to.equal(expectedResult);
    });
    it('should not affect other clients', async function () {
      const api1 = 'getSomething';
      const api2 = 'createPost';
      const api3 = 'deleteNews';
      let count = 0;

      const cb1 = () => count++;
      const cb2 = () => count += 10;
      const cb3 = () => count += 100;
      const expectedResult = 100;

      client2.provideService(api1, cb1);
      client3.provideService(api2, cb2);
      client4.provideService(api3, cb3);
      await wait(100);

      client2.destroyAllServices();
      client3.destroyAllServices();
      await wait(100);

      client1.emitService(api1);
      client1.emitService(api2);
      client1.emitService(api3);
      await wait(100);

      expect(count).to.equal(expectedResult);
    });
    it('should remove socket.io listeners', async function () {
      const api1 = 'getSomething';
      const api2 = 'createPost';
      const api3 = 'deleteNews';

      client1.provideService(api1, () => null);
      client1.provideService(api2, () => null);
      client1.provideService(api3, () => null);
      await wait(100);
      expect(client1.listeners(api1).length).to.equal(1);
      expect(client1.listeners(api2).length).to.equal(1);
      expect(client1.listeners(api3).length).to.equal(1);

      client1.destroyAllServices();
      await wait(100);
      expect(client1.listeners(api1).length).to.equal(0);
      expect(client1.listeners(api2).length).to.equal(0);
      expect(client1.listeners(api3).length).to.equal(0);
    });
  });
})
