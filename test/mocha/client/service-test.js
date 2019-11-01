const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;
const {startServer, stopServer, startServiceClients, startClients, wait, terminateClients} = require('../common');
const {SOCKET_EVENT} = require('../../../src/util/constants');
chai.use(chaiAsPromised);

describe('service API for p2p-client-plugin', function () {
  const numberOfClients = 4;
  let client1, client2, client3, client4;

  before(async function () {
    startServer();
  });

  after(function () {
    stopServer();
  });

  beforeEach(async function () {
    [client1, client2] = startClients(numberOfClients / 2);
    [client3, client4] = startServiceClients(numberOfClients / 2);
    await wait(200);
  });

  afterEach(async function () {
    terminateClients(client1, client2, client3, client4);
    await wait(200);
  });

  describe('initTopicListeners', function () { // this is called if isService === true
    it('should create listeners for SUBSCRIBE_TOPIC & UNSUBSCRIBE_TOPIC events', function () {
      expect(client3.listeners(SOCKET_EVENT.SUBSCRIBE_TOPIC)).to.have.lengthOf(1);
      expect(client3.listeners(SOCKET_EVENT.UNSUBSCRIBE_TOPIC)).to.have.lengthOf(1);
    });
    it('should not be called if isService === false', function () {
      expect(client1.listeners(SOCKET_EVENT.SUBSCRIBE_TOPIC)).to.have.lengthOf(0);
      expect(client1.listeners(SOCKET_EVENT.UNSUBSCRIBE_TOPIC)).to.have.lengthOf(0);
    });
  });
  describe('provideService function', function () {
    it('should allow clients to call created APIs', async function () {
      const api = 'getSomething';
      let count = 0;

      client3.provideService(api, () => count++);
      client3.provideService(api, () => count++);
      client3.provideService(api, () => count++);

      client1.emitService(client3.clientId, api);
      await wait(10);

      expect(count).to.equal(3);
    });
  });
  describe('destroyService function', function () {
    it('should destroy service APIs created with provideService', async function () {
      const api = 'getSomething';
      let count = 0;

      const cb1 = () => count++;
      const cb2 = () => count += 10;
      const cb3 = () => count += 100;

      client3.provideService(api, cb1);
      client3.provideService(api, cb2);
      client3.provideService(api, cb3);

      client3.destroyService(api, cb1);

      client1.emitService(client3.clientId, api);
      await wait(10);

      expect(count).to.equal(110);

      client3.destroyService(api);

      client1.emitService(client3.clientId, api);
      await wait(10);

      expect(count).to.equal(110);
    });
    it('should destroy all APIs if both parameter is nil', function () {
      const originalListenerCount = Object.keys(client3._callbacks).length;

      client3.provideService('api1', () => {});
      client3.provideService('api2', () => {});
      client3.provideService('api3', () => {});
      expect(Object.keys(client3._callbacks).length).to.equal(originalListenerCount + 3);

      client3.destroyService();
      expect(Object.keys(client3._callbacks).length).to.equal(originalListenerCount);
    });
    it('should keep topic listeners', function () {
      expect(client3.listeners(SOCKET_EVENT.SUBSCRIBE_TOPIC)).to.have.lengthOf(1);
      expect(client3.listeners(SOCKET_EVENT.UNSUBSCRIBE_TOPIC)).to.have.lengthOf(1);

      client3.provideService('api1', () => {});
      client3.provideService('api2', () => {});
      client3.provideService('api3', () => {});

      client3.destroyService();

      expect(client3.listeners(SOCKET_EVENT.SUBSCRIBE_TOPIC)).to.have.lengthOf(1);
      expect(client3.listeners(SOCKET_EVENT.UNSUBSCRIBE_TOPIC)).to.have.lengthOf(1);
    });
  });
  describe('topic related functions', function () {
    describe('createTopic function', function () {
      it('should allow publishTopic function to send data to subscribed clients', async function () {
        const topicName = 'testTopic';
        let count = 0;
        let hasError;

        client1.subscribeTopic(client3.clientId, topicName, () => count++);
        await wait(10);

        try {
          client3.publishTopic(topicName);
        } catch (e) {
          hasError = true;
        }

        expect(hasError).to.equal(true);
        client3.createTopic(topicName);
        client3.publishTopic(topicName);
        await wait(10);
        expect(count).to.equal(1);
      });
      it('should accept both string and array of strings as parameter', async function () {
        const topicName = 'firstOne';
        const topicNames = ['second', 'third', 'fourth'];
        let count = 0;

        client3.createTopic(topicName);
        client3.createTopic(topicNames);

        client1.subscribeTopic(client3.clientId, topicName, () => count++);
        client1.subscribeTopic(client3.clientId, 'invalidName', () => count++); // this callback should not be triggered
        topicNames.forEach(topicName => client1.subscribeTopic(client3.clientId, topicName, () => count++));

        await wait(10);

        client3.publishTopic(topicName, null);
        topicNames.forEach(topicName => client3.publishTopic(topicName, null));

        await wait(10);

        expect(count).to.equal(4);
      });
      it('should ignore non-string elements in array and create topics for valid elements', async function () {
        const topicNames = ['second', 1, {}, 'fourth', 3.14, 'third'];
        let count = 0;
        let hasError;

        client3.createTopic(topicNames);

        client1.subscribeTopic(client3.clientId, 'invalidName', () => count++); // this callback should not be triggered
        topicNames.forEach(topicName => {
          if (typeof topicName !== 'string') return; // subscribeTopic will throw error if topicName is not string
          client1.subscribeTopic(client3.clientId, topicName, () => count++);
        });

        await wait(10);

        topicNames.forEach(topicName => {
          try {
            client3.publishTopic(topicName, null);
          } catch (e) {
            hasError =true;
          }
        });

        await wait(10);

        expect(hasError).to.equal(true);
        expect(count).to.equal(3);
      });
      it('should do nothing if topic is already created', async function () {
        const topicName = 'testTopic';
        let count = 0;

        client3.createTopic(topicName);
        client3.createTopic(topicName);
        client3.createTopic(topicName);
        client1.subscribeTopic(client3.clientId, topicName, () => count++);

        await wait(10);
        client3.publishTopic(topicName);
        await wait(10);

        expect(count).to.equal(1);
      });
      it('should create a modified version of topic name', async function () {
        const topic = 'testTopic';
        const modifiedName = `service:${client3.clientId}:topic:${topic}`
        client3.createTopic(topic);
        await wait(10);
        expect(client3.createdTopics.includes(modifiedName)).to.equal(true);
      });
    });
    describe('destroyTopic function', function () {
      it('should stop publishTopic function from sending data', async function () {
        const topicName = 'testTopic';
        let count = 0;
        let errorCount = 0;

        client3.createTopic(topicName);
        client1.subscribeTopic(client3.clientId, topicName, () => count++);
        await wait(10);
        client3.publishTopic(topicName);
        await wait(10);
        expect(count).to.equal(1);

        client3.destroyTopic(topicName);
        await wait(10);
        try {
          client3.publishTopic(topicName);
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
        let count = 0;
        let errorCount = 0;

        client3.createTopic(topicName);
        client3.createTopic(topicNames);

        client1.subscribeTopic(client3.clientId, topicName, () => count++);
        topicNames.forEach(topicName => client1.subscribeTopic(client3.clientId, topicName, () => count++));

        await wait(10);

        client3.publishTopic(topicName, null);
        topicNames.forEach(topicName => client3.publishTopic(topicName, null));

        await wait(10);

        expect(count).to.equal(4);
        expect(errorCount).to.equal(0);

        client3.destroyTopic(topicName);
        client3.destroyTopic(topicNames);

        await wait(10);

        try { client3.publishTopic(topicName, null); } catch (e) {errorCount++}
        topicNames.forEach(topicName => {try { client3.publishTopic(topicName, null) } catch (e) {errorCount++}});

        expect(count).to.equal(4);
        expect(errorCount).to.equal(4);
      });
      it('should ignore non-string elements in array and destroy topics for valid elements', async function () {
        const topicNames = ['second', 1, {}, 'fourth', 3.14, 'third'];
        let count = 0;
        let errorCount = 0;
        let hasError;

        client3.createTopic(topicNames);

        topicNames.forEach(topicName => {
          if (typeof topicName !== 'string') return; // subscribeTopic will throw error if topicName is not string
          client1.subscribeTopic(client3.clientId, topicName, () => count++)
        });

        await wait(10);

        topicNames.forEach(topicName => {
          try {
            client3.publishTopic(topicName, null);
          } catch (e) {
            hasError = true;
          }
        });

        await wait(10);

        expect(hasError).to.equal(true);
        expect(count).to.equal(3);
        expect(errorCount).to.equal(0);

        client3.destroyTopic(topicNames);

        await wait(10);

        topicNames.forEach(topicName => {try { client3.publishTopic(topicName, null) } catch (e) {errorCount++}});

        expect(count).to.equal(3);
        expect(errorCount).to.equal(6);
      });
      it('should do nothing if topic is already destroyed', async function () {
        const topicName = 'testTopic';
        let count = 0;
        let errorCount = 0;

        client3.createTopic(topicName);
        client1.subscribeTopic(client3.clientId, topicName, () => count++);

        await wait(10);
        client3.publishTopic(topicName);
        await wait(10);
        expect(count).to.equal(1);

        client3.destroyTopic(topicName);
        client3.destroyTopic(topicName);
        client3.destroyTopic(topicName);

        await wait(10);
        try { client3.publishTopic(topicName) } catch (e) {errorCount++};
        await wait(10);
        expect(count).to.equal(1);
        expect(errorCount).to.equal(1);
      });
      it('should force clients to unsubscribe the destroyed topic & destroy related listeners', async function () {
        const topicName = 'testTopic';
        let count1 = 0;
        let count2 = 0;

        client3.createTopic(topicName);
        client1.subscribeTopic(client3.clientId, topicName, () => count1++);
        client2.subscribeTopic(client3.clientId, topicName, () => count2++);
        await wait(10);

        client3.publishTopic(topicName);
        await wait(10);

        expect(count1).to.equal(1);
        expect(count2).to.equal(1);

        client3.destroyTopic(topicName);
        client3.createTopic(topicName);
        await wait(10);

        client3.publishTopic(topicName);
        await wait(10);

        expect(count1).to.equal(1);
        expect(count2).to.equal(1);

        client1.subscribeTopic(client3.clientId, topicName, () => count1++);
        await wait(10);

        client3.publishTopic(topicName);
        await wait(10);

        expect(count1).to.equal(2);
        expect(count2).to.equal(1);
      });
    });
    describe('publishTopic function', function () {
      it('should throw error if topicName is not a string', function () {
        expect(client3.publishTopic.bind(client3, {})).to.throw();
        expect(client3.publishTopic.bind(client3, 1)).to.throw();
      });
    });
    describe('subscribeTopic function', function () {
      it('should wait for createTopic on service side', async function () {
        const topicName = 'testTopic';
        let count = 0;

        client1.subscribeTopic(client3.clientId, topicName, () => count++);
        await wait(10);
        client3.createTopic(topicName);
        client3.publishTopic(topicName);
        await wait(10);

        expect(count).to.equal(1);
      });
      it('should throw error if service or topic name is nil/not a string', async function () {
        const topicName = 'testTopic';

        client3.createTopic(topicName);
        expect(client1.subscribeTopic.bind(client1, client3.clientId, null, () => {})).to.throw();
        expect(client1.subscribeTopic.bind(client1, client3.clientId, {}, () => {})).to.throw();
        expect(client1.subscribeTopic.bind(client1, client3.clientId, 1.23, () => {})).to.throw();
        expect(client1.subscribeTopic.bind(client1, null, topicName, () => {})).to.throw();
        expect(client1.subscribeTopic.bind(client1, {}, topicName, () => {})).to.throw();
        expect(client1.subscribeTopic.bind(client1, 1.24, topicName, () => {})).to.throw();
      });
      it('should throw error if any parameter is nil', async function () {
        const topicName = 'testTopic';

        client3.createTopic(topicName);
        expect(client1.subscribeTopic.bind(client1, null, topicName, () => {})).to.throw();
        expect(client1.subscribeTopic.bind(client1, client3.clientId, null, () => {})).to.throw();
        expect(client1.subscribeTopic.bind(client1, client3.clientId, topicName, null)).to.throw();
      });
      it('should create 2 listeners for each subscribed topic (allow subscribing multiple times to a topic)', async function () {
        const topicName1 = 'testTopic';
        const topicName2 = 'another';

        client3.createTopic(topicName1);
        client4.createTopic(topicName2);

        client1.subscribeTopic(client3.clientId, topicName1, () => {});
        client1.subscribeTopic(client3.clientId, topicName1, () => {});
        client1.subscribeTopic(client4.clientId, topicName2, () => {});
        await wait(10);

        expect(client1.listeners(`service:${client3.clientId}:topic:${topicName1}-${SOCKET_EVENT.DEFAULT_TOPIC_EVENT}`)).to.have.lengthOf(2);
        expect(client1.listeners(`service:${client3.clientId}:topic:${topicName1}-${SOCKET_EVENT.TOPIC_BEING_DESTROYED}`)).to.have.lengthOf(2);
        expect(client1.listeners(`service:${client4.clientId}:topic:${topicName2}-${SOCKET_EVENT.DEFAULT_TOPIC_EVENT}`)).to.have.lengthOf(1);
        expect(client1.listeners(`service:${client4.clientId}:topic:${topicName2}-${SOCKET_EVENT.TOPIC_BEING_DESTROYED}`)).to.have.lengthOf(1);
      });
      it('should remove listeners related to a topic when that topic is destroyed on service side', async function () {
        const topicName1 = 'testTopic';
        const topicName2 = 'another';

        const event1 = `service:${client3.clientId}:topic:${topicName1}-${SOCKET_EVENT.DEFAULT_TOPIC_EVENT}`;
        const event2 = `service:${client3.clientId}:topic:${topicName1}-${SOCKET_EVENT.TOPIC_BEING_DESTROYED}`;
        const event3 = `service:${client4.clientId}:topic:${topicName2}-${SOCKET_EVENT.DEFAULT_TOPIC_EVENT}`;
        const event4 = `service:${client4.clientId}:topic:${topicName2}-${SOCKET_EVENT.TOPIC_BEING_DESTROYED}`;

        client3.createTopic(topicName1);
        client4.createTopic(topicName2);

        client1.subscribeTopic(client3.clientId, topicName1, () => {});
        client1.subscribeTopic(client3.clientId, topicName1, () => {});
        client1.subscribeTopic(client4.clientId, topicName2, () => {});
        await wait(10);

        expect(client1.listeners(event1)).to.have.lengthOf(2);
        expect(client1.listeners(event2)).to.have.lengthOf(2);
        expect(client1.listeners(event3)).to.have.lengthOf(1);
        expect(client1.listeners(event4)).to.have.lengthOf(1);

        client3.destroyTopic(topicName1);
        await wait(10);

        expect(client1.listeners(event1)).to.have.lengthOf(0);
        expect(client1.listeners(event2)).to.have.lengthOf(0);
        expect(client1.listeners(event3)).to.have.lengthOf(1);
        expect(client1.listeners(event4)).to.have.lengthOf(1);

        client4.destroyTopic(topicName2);
        await wait(10);

        expect(client1.listeners(event1)).to.have.lengthOf(0);
        expect(client1.listeners(event2)).to.have.lengthOf(0);
        expect(client1.listeners(event3)).to.have.lengthOf(0);
        expect(client1.listeners(event4)).to.have.lengthOf(0);
      });
    });
    describe('unsubscribeTopic function', function () {
      it('should throw error if service or topic name is nil/not a string', async function () {
        const topicName = 'testTopic';

        client3.createTopic(topicName);
        client1.subscribeTopic(client3.clientId, topicName, () => {});
        expect(client1.unsubscribeTopic.bind(client1, client3.clientId, null)).to.throw();
        expect(client1.unsubscribeTopic.bind(client1, client3.clientId, {})).to.throw();
        expect(client1.unsubscribeTopic.bind(client1, client3.clientId, 123)).to.throw();
        expect(client1.unsubscribeTopic.bind(client1, null, topicName)).to.throw();
        expect(client1.unsubscribeTopic.bind(client1, {}, topicName)).to.throw();
        expect(client1.unsubscribeTopic.bind(client1, 456, topicName)).to.throw();
      });
      it('should throw error if any parameter is nil', async function () {
        const topicName = 'testTopic';

        client3.createTopic(topicName);
        client1.subscribeTopic(client3.clientId, topicName, () => {});
        expect(client1.unsubscribeTopic.bind(client1, client3.clientId, null)).to.throw();
        expect(client1.unsubscribeTopic.bind(client1, null, topicName)).to.throw();
      });
      it('should remove listeners related to the unsubscribed topic', async function () {
        const topicName1 = 'testTopic';
        const topicName2 = 'another';

        const event1 = `service:${client3.clientId}:topic:${topicName1}-${SOCKET_EVENT.DEFAULT_TOPIC_EVENT}`;
        const event2 = `service:${client3.clientId}:topic:${topicName1}-${SOCKET_EVENT.TOPIC_BEING_DESTROYED}`;
        const event3 = `service:${client3.clientId}:topic:${topicName2}-${SOCKET_EVENT.DEFAULT_TOPIC_EVENT}`;
        const event4 = `service:${client3.clientId}:topic:${topicName2}-${SOCKET_EVENT.TOPIC_BEING_DESTROYED}`;
        const event5 = `service:${client4.clientId}:topic:${topicName2}-${SOCKET_EVENT.DEFAULT_TOPIC_EVENT}`;
        const event6 = `service:${client4.clientId}:topic:${topicName2}-${SOCKET_EVENT.TOPIC_BEING_DESTROYED}`;

        client3.createTopic(topicName1);
        client4.createTopic(topicName2);

        client1.subscribeTopic(client3.clientId, topicName1, () => {});
        client1.subscribeTopic(client3.clientId, topicName2, () => {});
        client1.subscribeTopic(client4.clientId, topicName2, () => {});
        await wait(10);

        expect(client1.listeners(event1)).to.have.lengthOf(1);
        expect(client1.listeners(event2)).to.have.lengthOf(1);
        expect(client1.listeners(event3)).to.have.lengthOf(1);
        expect(client1.listeners(event4)).to.have.lengthOf(1);
        expect(client1.listeners(event5)).to.have.lengthOf(1);
        expect(client1.listeners(event6)).to.have.lengthOf(1);

        client1.unsubscribeTopic(client3.clientId, topicName1);
        await wait(10);

        expect(client1.listeners(event1)).to.have.lengthOf(0);
        expect(client1.listeners(event2)).to.have.lengthOf(0);
        expect(client1.listeners(event3)).to.have.lengthOf(1);
        expect(client1.listeners(event4)).to.have.lengthOf(1);
        expect(client1.listeners(event5)).to.have.lengthOf(1);
        expect(client1.listeners(event6)).to.have.lengthOf(1);

        client1.unsubscribeTopic(client3.clientId, topicName2);
        await wait(10);

        expect(client1.listeners(event1)).to.have.lengthOf(0);
        expect(client1.listeners(event2)).to.have.lengthOf(0);
        expect(client1.listeners(event3)).to.have.lengthOf(0);
        expect(client1.listeners(event4)).to.have.lengthOf(0);
        expect(client1.listeners(event5)).to.have.lengthOf(1);
        expect(client1.listeners(event6)).to.have.lengthOf(1);

        client1.unsubscribeTopic(client4.clientId, topicName2);
        await wait(10);

        expect(client1.listeners(event1)).to.have.lengthOf(0);
        expect(client1.listeners(event2)).to.have.lengthOf(0);
        expect(client1.listeners(event3)).to.have.lengthOf(0);
        expect(client1.listeners(event4)).to.have.lengthOf(0);
        expect(client1.listeners(event5)).to.have.lengthOf(0);
        expect(client1.listeners(event6)).to.have.lengthOf(0);
      });
    });
    describe('clients subscribed to a service\'s topic', function () {
      it('should receive messages from subscribed topics', function (done) {
        const topicName = 'testTopic';
        const dataToSend = 'dataFromService';

        client3.createTopic(topicName);
        client1.subscribeTopic(client3.clientId, topicName, (data) => {
          expect(data).to.equal(dataToSend);
          done();
        });

        setTimeout(() => client3.publishTopic(topicName, dataToSend), 100);
      });
      it('should not receive messages from unsubscribed services', async function () {
        const topicName = 'testTopic';
        let count = 0;

        client3.createTopic(topicName);
        client4.createTopic(topicName);
        client1.subscribeTopic(client3.clientId, topicName, () => count++);

        await wait(10);
        client3.publishTopic(topicName, null);
        client3.publishTopic(topicName, null);
        client4.publishTopic(topicName, null);
        client4.publishTopic(topicName, null);

        await wait(10);
        expect(count).to.equal(2);
      });
      it('should not receive messages from unsubscribed topics', async function () {
        const topicName1 = 'testTopic';
        const topicName2 = 'anotherOne';
        let count = 0;

        client3.createTopic(topicName1);
        client3.createTopic(topicName2);
        client1.subscribeTopic(client3.clientId, topicName1, () => count++);

        await wait(10);
        client3.publishTopic(topicName1, null);
        client3.publishTopic(topicName1, null);
        client3.publishTopic(topicName2, null);
        client3.publishTopic(topicName2, null);

        await wait(10);
        expect(count).to.equal(2);
      });
      it('should work correctly in n-n connections', async function () {
        // Test scenario: c1 subs c3, c4's topics, c2 subs c4's topics
        const topic1 = 'first one';
        const topic2 = 'second';
        const topic3 = '3rd';

        client1.count = 0;
        client2.count = 0;

        client3.createTopic(topic1, topic2, topic3);
        client3.createTopic(topic1, topic2, topic3);
        client4.createTopic(topic1, topic2, topic3);

        client1.subscribeTopic(client3.clientId, topic1, () => client1.count++);
        client1.subscribeTopic(client3.clientId, topic2, () => client1.count += 10);
        client1.subscribeTopic(client4.clientId, topic1, () => client1.count += 100);
        client2.subscribeTopic(client3.clientId, topic2, () => client2.count -= 7);
        client2.subscribeTopic(client4.clientId, topic3, () => client2.count -= 70);

        await wait(10);
        client3.publishTopic(topic1);
        client3.publishTopic(topic2);
        client3.publishTopic(topic3);
        client4.publishTopic(topic1);
        client4.publishTopic(topic2);
        client4.publishTopic(topic3);
        await wait(10);

        expect(client1.count).to.equal(111);
        expect(client2.count).to.equal(-77);
      });
    });
  });
})
