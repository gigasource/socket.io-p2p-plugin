const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;
const {startServer, stopServer, startClients, wait, terminateClients} = require('../common');
chai.use(chaiAsPromised);

describe('Server Service API', function () {
  const numberOfClients = 3;

  let client1, client2, client3;
  let server;

  after(function () {
    stopServer();
  });

  beforeEach(async function () {
    server = startServer({isService: true});
    [client1, client2, client3] = startClients(numberOfClients);
    await wait(200);
  });

  afterEach(async function () {
    terminateClients(client1, client2, client3);
    await wait(200);
  });

  describe('provideService function', function () {
    it('should have no effects if new API name is duplicate of created API names', async function () {
      const apiName = 'createPost';
      let count = 0;

      server.provideService(apiName, () => count++);
      server.provideService(apiName, () => count += 10);

      client1.emitService(apiName);
      await wait(100);

      expect(count).to.equal(1);
    });
  });
  describe('destroyService function', function () {
    it('should destroy correct APIs & leave the rest unaffected', async function () {
      const api1 = 'createNews';
      const api2 = 'getNews';
      const api3 = 'deleteNews';
      let count = 0;

      const cb1 = () => count++;
      const cb2 = () => count += 10;
      const cb3 = () => count += 100;

      server.provideService(api1, cb1);
      server.provideService(api2, cb2);
      server.provideService(api3, cb3);

      server.destroyService(api2, cb1);

      client1.emitService(api1);
      client1.emitService(api2);
      client1.emitService(api3);
      await wait(100);

      expect(count).to.equal(1 + 100);

      server.destroyService(api3);

      client1.emitService(api1);
      client1.emitService(api2);
      client1.emitService(api3);
      await wait(100);

      expect(count).to.equal(101 + 1);
    });
  });
  describe('destroyAllServices function', function () {
    it('should destroy all APIs created by server (client APIs are not affected)', async function () {
      const api1 = 'createNews';
      const api2 = 'getNews';
      const api3 = 'deleteNews';
      let count = 0;

      const cb1 = () => count++;
      const cb2 = () => count += 10;
      const cb3 = () => count += 100;

      server.provideService(api1, cb1);
      server.provideService(api2, cb2);
      client2.provideService(api3, cb3);
      await wait(100);

      server.destroyAllServices();

      client1.emitService(api1);
      client1.emitService(api2);
      client1.emitService(api3);
      await wait(100);

      expect(count).to.equal(100);
    });
  });
});
