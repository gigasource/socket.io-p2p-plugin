const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;
const {SOCKET_EVENT} = require('../../../src/util/constants');
const {startServer, stopServer, startClients, wait, terminateClients} = require('../common');
const P2pServerServiceApi = require('../../../src/api/server/service');
chai.use(chaiAsPromised);

describe('server-side service API', function () {
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

  describe('when the server is created with isService === true', function () {
    it('should create necessary event listeners for each socket', function () {
      Object.keys(server.sockets.sockets).forEach((key) => {
        const socket = server.sockets.sockets[key];
        expect(socket.listeners('disconnect')).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_EMIT)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.JOIN_ROOM)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.LEAVE_ROOM)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.EMIT_ROOM)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.MULTI_API_ADD_TARGET)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.MULTI_API_CREATE_STREAM)).to.have.length(1);
        expect(socket.listeners(SOCKET_EVENT.LIST_CLIENTS)).to.have.length(1);
      });
    });
    describe('asService function', function () {
      it('should return an object of type P2pServerServiceApi', function () {
        const obj = server.asService('test');
        expect(obj instanceof P2pServerServiceApi).to.equal(true);
      });
    });
    describe('provideService function', function () {
      it('should create SUBSCRIBE_TOPIC & UNSUBSCRIBE_TOPIC listeners for each new service registered (no duplicates)', function () {
        const service1 = 's1';
        const service2 = 's2';

        const api1 = 'create';
        const api2 = 'update';

        const serverApi = server.asService();

        server.asService(service1).provideService(api1, () => {});
        server.asService(service1).provideService(api1, () => {});
        server.asService(service1).provideService(api2, () => {});
        server.asService(service1).provideService(api2, () => {});
        server.asService(service2).provideService(api1, () => {});
        server.asService(service2).provideService(api2, () => {});

        expect(serverApi.serviceApis[`${service1}:${SOCKET_EVENT.SUBSCRIBE_TOPIC}`]).to.have.lengthOf(1);
        expect(serverApi.serviceApis[`${service1}:${SOCKET_EVENT.UNSUBSCRIBE_TOPIC}`]).to.have.lengthOf(1);
        expect(serverApi.serviceApis[`${service2}:${SOCKET_EVENT.SUBSCRIBE_TOPIC}`]).to.have.lengthOf(1);
        expect(serverApi.serviceApis[`${service2}:${SOCKET_EVENT.UNSUBSCRIBE_TOPIC}`]).to.have.lengthOf(1);
      });
      it('should allow creating multiple handlers for an API', function () {
        const service1 = 's1';
        const service2 = 's2';

        const api1 = 'create';
        const api2 = 'update';

        const serverApi = server.asService();

        server.asService(service1).provideService(api1, () => {});
        server.asService(service1).provideService(api1, () => {});
        server.asService(service1).provideService(api2, () => {});
        server.asService(service1).provideService(api2, () => {});
        server.asService(service2).provideService(api1, () => {});
        server.asService(service2).provideService(api2, () => {});

        expect(serverApi.serviceApis[`${service1}:${api1}`]).to.have.lengthOf(2);
        expect(serverApi.serviceApis[`${service1}:${api2}`]).to.have.lengthOf(2);
        expect(serverApi.serviceApis[`${service2}:${api1}`]).to.have.lengthOf(1);
        expect(serverApi.serviceApis[`${service2}:${api2}`]).to.have.lengthOf(1);
      });
      it('should not mutate the args passed to callback', function (done) {
        // client use emitTo, which unshift the caller id to the argArray -> need to shift, this test is to check that
        const service1 = 's1';
        const api1 = 'create';
        const payload = 'data from client';

        server.asService(service1).provideService(api1, function (data) {
          expect(data).to.equal(payload);
          done();
        });

        client1.emitService(service1, api1, payload);
      });
    });
    describe('destroyService function', function () {
      it('should destroy service APIs created with provideService', async function () {
        const api = 'getSomething';
        const serviceName = 'testService';
        let count = 0;

        const cb1 = () => count++;
        const cb2 = () => count += 10;
        const cb3 = () => count += 100;

        server.asService(serviceName).provideService(api, cb1);
        server.asService(serviceName).provideService(api, cb2);
        server.asService(serviceName).provideService(api, cb3);

        server.asService(serviceName).destroyService(api, cb1);

        client1.emitService(serviceName, api);
        await wait(10);

        expect(count).to.equal(110);

        server.asService(serviceName).destroyService(api);

        client1.emitService(serviceName, api);
        await wait(10);

        expect(count).to.equal(110);
      });
      it('should destroy all APIs if both parameter is nil', async function () {
        const serviceName = 'testService';
        let count = 0;
        const api1 = 'create';
        const api2 = 'delete';
        const api3 = 'update';

        server.asService(serviceName).provideService(api1, () => count++);
        server.asService(serviceName).provideService(api2, () => count += 10);
        server.asService(serviceName).provideService(api3, () => count += 100);
        client1.emitService(serviceName, api1);
        client1.emitService(serviceName, api2);
        client1.emitService(serviceName, api3);
        await wait(10);

        expect(count).to.equal(111);
        server.asService(serviceName).destroyService();

        client1.emitService(serviceName, api1);
        client1.emitService(serviceName, api2);
        client1.emitService(serviceName, api3);
        await wait(10);

        expect(count).to.equal(111);
      });
      it('should keep topic APIs',  function () {
        const service1 = 'firstService';
        const service2 = '2ndOne';

        server.asService(service1).provideService('api1', () => {});
        server.asService(service2).provideService('api2', () => {});

        expect(server.serviceApis[`${service1}:${SOCKET_EVENT.SUBSCRIBE_TOPIC}`]).to.have.lengthOf(1);
        expect(server.serviceApis[`${service1}:${SOCKET_EVENT.UNSUBSCRIBE_TOPIC}`]).to.have.lengthOf(1);
        expect(server.serviceApis[`${service2}:${SOCKET_EVENT.SUBSCRIBE_TOPIC}`]).to.have.lengthOf(1);
        expect(server.serviceApis[`${service2}:${SOCKET_EVENT.UNSUBSCRIBE_TOPIC}`]).to.have.lengthOf(1);

        server.asService(service1).destroyService();
        server.asService(service2).destroyService();

        expect(server.serviceApis[`${service1}:${SOCKET_EVENT.SUBSCRIBE_TOPIC}`]).to.have.lengthOf(1);
        expect(server.serviceApis[`${service1}:${SOCKET_EVENT.UNSUBSCRIBE_TOPIC}`]).to.have.lengthOf(1);
        expect(server.serviceApis[`${service2}:${SOCKET_EVENT.SUBSCRIBE_TOPIC}`]).to.have.lengthOf(1);
        expect(server.serviceApis[`${service2}:${SOCKET_EVENT.UNSUBSCRIBE_TOPIC}`]).to.have.lengthOf(1);
      });
    });
    describe('destroyAllServices function', function () {
      it('should destroy all APIs', async function () {
        const serviceName1 = 'testService';
        const serviceName2 = 'testService';
        const serviceName3 = 'testService';
        let count = 0;
        const api1 = 'create';
        const api2 = 'delete';
        const api3 = 'update';

        server.asService(serviceName1).provideService(api1, () => count++);
        server.asService(serviceName2).provideService(api2, () => count += 10);
        server.asService(serviceName3).provideService(api3, () => count += 100);
        client1.emitService(serviceName1, api1);
        client1.emitService(serviceName2, api2);
        client1.emitService(serviceName3, api3);
        await wait(111);

        expect(count).to.equal(111);
        server.destroyAllServices();

        client1.emitService(serviceName1, api1);
        client1.emitService(serviceName2, api2);
        client1.emitService(serviceName3, api3);
        await wait(10);

        expect(count).to.equal(111);
      });
      it('should keep topic APIs',  function () {
        const service1 = 'firstService';
        const service2 = '2ndOne';

        server.asService(service1).provideService('api1', () => {});
        server.asService(service2).provideService('api2', () => {});

        expect(server.serviceApis[`${service1}:${SOCKET_EVENT.SUBSCRIBE_TOPIC}`]).to.have.lengthOf(1);
        expect(server.serviceApis[`${service1}:${SOCKET_EVENT.UNSUBSCRIBE_TOPIC}`]).to.have.lengthOf(1);
        expect(server.serviceApis[`${service2}:${SOCKET_EVENT.SUBSCRIBE_TOPIC}`]).to.have.lengthOf(1);
        expect(server.serviceApis[`${service2}:${SOCKET_EVENT.UNSUBSCRIBE_TOPIC}`]).to.have.lengthOf(1);

        server.destroyAllServices();

        expect(server.serviceApis[`${service1}:${SOCKET_EVENT.SUBSCRIBE_TOPIC}`]).to.have.lengthOf(1);
        expect(server.serviceApis[`${service1}:${SOCKET_EVENT.UNSUBSCRIBE_TOPIC}`]).to.have.lengthOf(1);
        expect(server.serviceApis[`${service2}:${SOCKET_EVENT.SUBSCRIBE_TOPIC}`]).to.have.lengthOf(1);
        expect(server.serviceApis[`${service2}:${SOCKET_EVENT.UNSUBSCRIBE_TOPIC}`]).to.have.lengthOf(1);
      });
    });
    describe('emitClient function', function () {
      it('should unshift service name in args array', function (done) {
        const service1 = 's1';
        const service2 = 's2';
        const event1 = 'ev1';
        const event2 = 'ev2';
        const payload1 = 'hello';
        const payload2 = 'abcdef';
        const api1 = 'create';
        const api2 = 'update';
        let count = 0;

        client1.on(event1, (serviceName, data1, data2) => {
          expect(serviceName).to.equal(service1);
          expect(data1).to.equal(payload1);
          expect(data2).to.equal(payload2);
          if (++count === 2) done();
        });

        client2.on(event2, (serviceName, data) => {
          expect(serviceName).to.equal(service2);
          expect(data).to.equal(payload2);
          if (++count === 2) done();
        });

        server.asService(service1).provideService(api1, () => {
          server.asService(service2).emitClient(client2.clientId, event2, payload2);
        });

        server.asService(service2).provideService(api2, () => {
          server.asService(service1).emitClient(client1.clientId, event1, payload1, payload2);
        });

        client1.emitService(service1, api1);
        client1.emitService(service2, api2);
      });
      it('should be able to use ack fn', function (done) {
        const service = 's1';
        const event = 'ev1';
        const payload = 'hello';
        const payloadModifier = ' from client';
        const api = 'create';

        client1.onService(service, event, (data, ackFn) => {
          expect(data).to.equal(payload);
          ackFn(data + payloadModifier);
        });

        server.asService(service).provideService(api, () => {
          server.asService(service).emitClient(client1.clientId, event, payload, (dataFromClient) => {
            expect(dataFromClient).to.equal(payload + payloadModifier);
            done();
          });
        });

        client1.emitService(service, api);
      });
    });
    describe('topic related functions', function () {
      describe('createTopic function', function () {
        it('should allow publishTopic function to send data to subscribed clients', async function () {
          const topicName = 'testTopic';
          const serviceName = 'some-service';
          let count = 0;
          let hasError;

          // subscribeTopic will do nothing because server is not registered as a service
          client1.subscribeTopic(serviceName, topicName, () => count++);
          await wait(10);

          try {
            server.publishTopic(topicName);
          } catch (e) {
            hasError = true;
          }

          expect(hasError).to.equal(true);
          server.asService(serviceName).createTopic(topicName);
          client1.subscribeTopic(serviceName, topicName, () => count++);
          await wait(10);
          server.asService(serviceName).publishTopic(topicName);

          await wait(10);
          expect(count).to.equal(1);
        });
        it('should accept both string and array of strings as parameter', async function () {
          const topicName = 'firstOne';
          const topicNames = ['second', 'third', 'fourth'];
          const serviceName = 'testService';
          let count = 0;

          server.asService(serviceName).createTopic(topicName);
          server.asService(serviceName).createTopic(topicNames);

          client1.subscribeTopic(serviceName, topicName, () => count++);
          client1.subscribeTopic(serviceName, 'invalidName', () => count++); // this callback should not be triggered
          topicNames.forEach(topicName => client1.subscribeTopic(serviceName, topicName, () => count++));

          await wait(10);

          server.asService(serviceName).publishTopic(topicName, null);
          topicNames.forEach(topicName => server.asService(serviceName).publishTopic(topicName, null));

          await wait(10);

          expect(count).to.equal(4);
        });
        it('should ignore non-string elements in array and create topics for valid elements', async function () {
          const topicNames = ['second', 1, {}, 'fourth', 3.14, 'third'];
          const serviceName = 'testService';
          let count = 0;
          let hasError;

          server.asService(serviceName).createTopic(topicNames);

          client1.subscribeTopic(serviceName, 'invalidName', () => count++); // this callback should not be triggered
          topicNames.forEach(topicName => {
            if (typeof topicName !== 'string') return; // subscribeTopic will throw error if topicName is not string
            client1.subscribeTopic(serviceName, topicName, () => count++);
          });

          await wait(10);

          topicNames.forEach(topicName => {
            try {
              server.asService(serviceName).publishTopic(topicName, null);
            } catch (e) {
              hasError = true;
            }
          });

          await wait(10);

          expect(hasError).to.equal(true);
          expect(count).to.equal(3);
        });
        it('should do nothing if topic is already created', async function () {
          const topicName = 'testTopic';
          const serviceName = 'testService';
          let count = 0;

          server.asService(serviceName).createTopic(topicName);
          server.asService(serviceName).createTopic(topicName);
          server.asService(serviceName).createTopic(topicName);
          client1.subscribeTopic(serviceName, topicName, () => count++);

          await wait(10);
          server.asService(serviceName).publishTopic(topicName);
          await wait(10);

          expect(count).to.equal(1);
        });
        it('should create a modified version of topic name', async function () {
          const topic = 'testTopic';
          const serviceName = 'testService';
          const modifiedName = `service:${serviceName}:topic:${topic}`
          server.asService(serviceName).createTopic(topic);
          await wait(10);
          expect(server.createdTopics.includes(modifiedName)).to.equal(true);
        });
      });
      describe('destroyTopic function', function () {
        it('should stop publishTopic function from sending data', async function () {
          const topicName = 'testTopic';
          const serviceName = 'testService';
          let count = 0;
          let errorCount = 0;

          server.asService(serviceName).createTopic(topicName);
          client1.subscribeTopic(serviceName, topicName, () => count++);
          await wait(10);
          server.asService(serviceName).publishTopic(topicName);
          await wait(10);
          expect(count).to.equal(1);

          server.asService(serviceName).destroyTopic(topicName);
          await wait(10);
          try {
            server.asService(serviceName).publishTopic(topicName);
          } catch (e) {
            errorCount++;
          }

          await wait(10);
          expect(count).to.equal(1);
          expect(errorCount).to.equal(1);
        });
        it('should accept both string and array of strings as parameter', async function () {
          const topicName = 'firstOne';
          const topicNames = ['second', 'third', 'fourth'];
          const serviceName = 'testService';
          let count = 0;
          let errorCount = 0;

          server.asService(serviceName).createTopic(topicName);
          server.asService(serviceName).createTopic(topicNames);

          client1.subscribeTopic(serviceName, topicName, () => count++);
          topicNames.forEach(topicName => client1.subscribeTopic(serviceName, topicName, () => count++));

          await wait(10);

          server.asService(serviceName).publishTopic(topicName, null);
          topicNames.forEach(topicName => server.asService(serviceName).publishTopic(topicName, null));

          await wait(10);

          expect(count).to.equal(4);
          expect(errorCount).to.equal(0);

          server.asService(serviceName).destroyTopic(topicName);
          server.asService(serviceName).destroyTopic(topicNames);

          await wait(10);

          try { server.asService(serviceName).publishTopic(topicName, null); } catch (e) {errorCount++}
          topicNames.forEach(topicName => {try { server.asService(serviceName).publishTopic(topicName, null) } catch (e) {errorCount++}});

          expect(count).to.equal(4);
          expect(errorCount).to.equal(4);
        });
        it('should ignore non-string elements in array and destroy topics for valid elements', async function () {
          const topicNames = ['second', 1, {}, 'fourth', 3.14, 'third'];
          const serviceName = 'testService';
          let count = 0;
          let errorCount = 0;
          let hasError;

          server.asService(serviceName).createTopic(topicNames);

          topicNames.forEach(topicName => {
            if (typeof topicName !== 'string') return; // subscribeTopic will throw error if topicName is not string
            client1.subscribeTopic(serviceName, topicName, () => count++)
          });

          await wait(10);

          topicNames.forEach(topicName => {
            try {
              server.asService(serviceName).publishTopic(topicName, null);
            } catch (e) {
              hasError = true;
            }
          });

          await wait(10);

          expect(hasError).to.equal(true);
          expect(count).to.equal(3);
          expect(errorCount).to.equal(0);

          server.asService(serviceName).destroyTopic(topicNames);

          await wait(10);

          topicNames.forEach(topicName => {try { server.asService(serviceName).publishTopic(topicName, null) } catch (e) {errorCount++}});

          expect(count).to.equal(3);
          expect(errorCount).to.equal(6);
        });
        it('should do nothing if topic is already destroyed', async function () {
          const topicName = 'testTopic';
          const serviceName = 'testService';
          let count = 0;
          let errorCount = 0;

          server.asService(serviceName).createTopic(topicName);
          client1.subscribeTopic(serviceName, topicName, () => count++);

          await wait(10);
          server.asService(serviceName).publishTopic(topicName);
          await wait(10);
          expect(count).to.equal(1);

          server.asService(serviceName).destroyTopic(topicName);
          server.asService(serviceName).destroyTopic(topicName);
          server.asService(serviceName).destroyTopic(topicName);

          await wait(10);
          try { server.asService(serviceName).publishTopic(topicName) } catch (e) {errorCount++};
          await wait(10);
          expect(count).to.equal(1);
          expect(errorCount).to.equal(1);
        });
        it('should force clients to unsubscribe the destroyed topic & destroy related listeners', async function () {
          const topicName = 'testTopic';
          const serviceName = 'testService';
          let count1 = 0;
          let count2 = 0;

          server.asService(serviceName).createTopic(topicName);
          client1.subscribeTopic(serviceName, topicName, () => count1++);
          client2.subscribeTopic(serviceName, topicName, () => count2++);
          await wait(10);

          server.asService(serviceName).publishTopic(topicName);
          await wait(10);

          expect(count1).to.equal(1);
          expect(count2).to.equal(1);

          server.asService(serviceName).destroyTopic(topicName);
          server.asService(serviceName).createTopic(topicName);
          await wait(10);

          server.asService(serviceName).publishTopic(topicName);
          await wait(10);

          expect(count1).to.equal(1);
          expect(count2).to.equal(1);

          client1.subscribeTopic(serviceName, topicName, () => count1++);
          await wait(10);

          server.asService(serviceName).publishTopic(topicName);
          await wait(10);

          expect(count1).to.equal(2);
          expect(count2).to.equal(1);
        });
      });
      describe('publishTopic function', function () {
        it('should throw error if topicName is not a string', function () {
          const serviceName = 'testService';
          expect(server.asService(serviceName).publishTopic.bind(server, {})).to.throw();
          expect(server.asService(serviceName).publishTopic.bind(server, 1)).to.throw();
        });
      });
      describe('clients subscribed to a service\'s topic', function () {
        it('should receive messages from subscribed topics', function (done) {
          const topicName = 'testTopic';
          const dataToSend = 'dataFromService';
          const serviceName = 'testService';

          server.asService(serviceName).createTopic(topicName);
          client1.subscribeTopic(serviceName, topicName, (data) => {
            expect(data).to.equal(dataToSend);
            done();
          });

          setTimeout(() => server.asService(serviceName).publishTopic(topicName, dataToSend), 100);
        });
        it('should not receive messages from unsubscribed services', async function () {
          const topicName = 'testTopic';
          const serviceName = 'testService';
          const serviceName2 = 'anotherServ';
          let count = 0;

          server.asService(serviceName).createTopic(topicName);
          server.asService(serviceName2).createTopic(topicName);
          client1.subscribeTopic(serviceName, topicName, () => count++);

          await wait(10);
          server.asService(serviceName).publishTopic(topicName, null);
          server.asService(serviceName).publishTopic(topicName, null);
          server.asService(serviceName2).publishTopic(topicName, null);
          server.asService(serviceName2).publishTopic(topicName, null);

          await wait(10);
          expect(count).to.equal(2);
        });
        it('should not receive messages from unsubscribed topics', async function () {
          const topicName1 = 'testTopic';
          const topicName2 = 'anotherOne';
          const serviceName = 'testService';
          let count = 0;

          server.asService(serviceName).createTopic(topicName1);
          server.asService(serviceName).createTopic(topicName2);
          client1.subscribeTopic(serviceName, topicName1, () => count++);

          await wait(10);
          server.asService(serviceName).publishTopic(topicName1, null);
          server.asService(serviceName).publishTopic(topicName1, null);
          server.asService(serviceName).publishTopic(topicName2, null);
          server.asService(serviceName).publishTopic(topicName2, null);

          await wait(10);
          expect(count).to.equal(2);
        });
        it('should work correctly in n-n connections', async function () {
          // Test scenario: c1 subs service1, service2's topics, c2 subs service2's topics
          const topic1 = 'first one';
          const topic2 = 'second';
          const topic3 = '3rd';

          const serviceName = 'firstOne';
          const serviceName2 = '2nd';

          client1.count = 0;
          client2.count = 0;

          server.asService(serviceName).createTopic(topic1, topic2, topic3);
          server.asService(serviceName).createTopic(topic1, topic2, topic3);
          server.asService(serviceName2).createTopic(topic1, topic2, topic3);

          client1.subscribeTopic(serviceName, topic1, () => client1.count++);
          client1.subscribeTopic(serviceName, topic2, () => client1.count += 10);
          client1.subscribeTopic(serviceName2, topic1, () => client1.count += 100);
          client2.subscribeTopic(serviceName, topic2, () => client2.count -= 7);
          client2.subscribeTopic(serviceName2, topic3, () => client2.count -= 70);

          await wait(10);
          server.asService(serviceName).publishTopic(topic1);
          server.asService(serviceName).publishTopic(topic2);
          server.asService(serviceName).publishTopic(topic3);
          server.asService(serviceName2).publishTopic(topic1);
          server.asService(serviceName2).publishTopic(topic2);
          server.asService(serviceName2).publishTopic(topic3);
          await wait(10);

          expect(client1.count).to.equal(111);
          expect(client2.count).to.equal(-77);
        });
      });
    });
  });
});
