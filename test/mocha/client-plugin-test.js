const expect = require('expect.js');
const {SOCKET_EVENT} = require('../../src/util/constants');
const {startClient, wait, terminateClients, generateClientIds} = require('./common');

describe('p2p-client-plugin', function () {
  const numberOfClients = 3;
  let client1Id, client2Id, client3Id;

  let client1;
  let client2;
  let client3;

  beforeEach(async function () {
    [client1Id, client2Id, client3Id] = generateClientIds(numberOfClients);

    client1 = startClient(client1Id);
    client2 = startClient(client2Id);
    client3 = startClient(client3Id);
    await wait(200);
  })

  afterEach(async function () {
    terminateClients(client1, client2, client3);
    await wait(200);
  })

  describe('constructor', function () {
    it('should initialize lifecycle listeners', function () {
      expect(client1.listeners(SOCKET_EVENT.P2P_REGISTER)).to.have.length(1);
      expect(client1.listeners(SOCKET_EVENT.P2P_DISCONNECT)).to.have.length(1);
      expect(client1.listeners(SOCKET_EVENT.P2P_UNREGISTER)).to.have.length(1);

      expect(client2.listeners(SOCKET_EVENT.P2P_REGISTER)).to.have.length(1);
      expect(client2.listeners(SOCKET_EVENT.P2P_DISCONNECT)).to.have.length(1);
      expect(client2.listeners(SOCKET_EVENT.P2P_UNREGISTER)).to.have.length(1);

      expect(client3.listeners(SOCKET_EVENT.P2P_REGISTER)).to.have.length(1);
      expect(client3.listeners(SOCKET_EVENT.P2P_DISCONNECT)).to.have.length(1);
      expect(client3.listeners(SOCKET_EVENT.P2P_UNREGISTER)).to.have.length(1);
    });
  })

  describe('custom functions', function () {
    it('should exist', function () {
      expect(client1.registerP2pTarget).to.be.a('function');
      expect(client1.unregisterP2pTarget).to.be.a('function');
      expect(client1.emit2).to.be.a('function');
      expect(client1.emitP2p).to.be.a('function');
      expect(client1.getClientList).to.be.a('function');
    });

    describe('registerP2pTarget function', function () {
      it('should return true if connect successfully', async function () {
        const connectionSuccess = await client1.registerP2pTarget(client3Id, {});
        expect(connectionSuccess).to.be(true);
      });
      it('should return false if target client ID does not exist on server', async function () {
        const connectionSuccess = await client1.registerP2pTarget('invalidId', {});
        expect(connectionSuccess).to.be(false);
      });
      it('should return false if target client is connected to another client', async function () {
        let connectionSuccess = await client1.registerP2pTarget(client2Id, {});
        expect(connectionSuccess).to.be(true);
        connectionSuccess = await client3.registerP2pTarget(client2Id, {});
        expect(connectionSuccess).to.be(false);
      });
      it('should not allow registering to the source client ID', function () {
        expect(client1.registerP2pTarget.bind(client1, client1Id)).to.throwError();
      });
      it('should throw error if clientTargetId is not empty', async function () {
        let connectionSuccess = await client1.registerP2pTarget(client2Id);
        expect(connectionSuccess).to.be(true);
        expect(client1.registerP2pTarget.bind(client1, client3Id)).to.throwError();
      });
    })
    describe('unregisterP2pTarget function', function () {
      it('should free both clients', async function () {
        let connectionSuccess = await client1.registerP2pTarget(client3Id, {});
        expect(connectionSuccess).to.be(true);
        connectionSuccess = await client2.registerP2pTarget(client3Id, {});
        expect(connectionSuccess).to.be(false);
        await client1.unregisterP2pTarget();
        expect(client1.targetClientId).to.be(undefined);
        expect(client3.targetClientId).to.be(undefined);
        connectionSuccess = await client2.registerP2pTarget(client3Id, {});
        expect(connectionSuccess).to.be(true);
      });
      it('should not have any effects if source client unregistered previously', async function () {
        let connectionSuccess = await client1.registerP2pTarget(client3Id, {});
        expect(connectionSuccess).to.be(true);

        connectionSuccess = await client2.registerP2pTarget(client3Id, {});
        expect(connectionSuccess).to.be(false);

        await client1.unregisterP2pTarget();

        connectionSuccess = await client2.registerP2pTarget(client3Id, {});
        expect(connectionSuccess).to.be(true);

        await client1.unregisterP2pTarget();
        client1.disconnect();
        await wait(500);

        expect(client2.targetClientId).to.be(client3Id);
        expect(client3.targetClientId).to.be(client2Id);
      })
      it('should work similarly with both clients', async function () {
        let connectionSuccess = await client1.registerP2pTarget(client2Id, {});
        expect(connectionSuccess).to.be(true);
        expect(client1.targetClientId).to.be(client2Id);
        expect(client2.targetClientId).to.be(client1Id);
        await client1.unregisterP2pTarget();
        expect(client1.targetClientId).to.be(undefined);
        expect(client2.targetClientId).to.be(undefined);

        connectionSuccess = await client1.registerP2pTarget(client2Id, {});
        expect(connectionSuccess).to.be(true);
        expect(client1.targetClientId).to.be(client2Id);
        expect(client2.targetClientId).to.be(client1Id);
        await client2.unregisterP2pTarget();
        expect(client1.targetClientId).to.be(undefined);
        expect(client2.targetClientId).to.be(undefined);
      });
    })
    describe('emit2 function', function () {
      this.timeout(5000);
      it('should emit events to correct target', async function () {
        let c2Result, c3Result;

        const eventC1ToC2 = '1to2';
        const eventC1ToC3 = '1to3';
        const eventC3ToC2 = '3to2';

        const dataC1ToC2 = 'from1to2';
        const dataC1ToC3 = 'from1to3';
        const dataC3ToC2 = 'from3to2';

        const toC2FromC1EventListener = new Promise(resolve => {
          client2.on(eventC1ToC2, arg => {
            c2Result = arg;
            resolve();
          })
        });

        const toC3FromC1EventListener = new Promise(resolve => {
          client3.on(eventC1ToC3, arg => {
            c3Result = arg;
            resolve();
          })
        });

        const toC2FromC3EventListener = new Promise(resolve => {
          client2.on(eventC3ToC2, arg => {
            c2Result = arg;
            resolve();
          })
        });

        await wait(500);

        // Start testing -------------------
        let connectionSuccess = await client1.registerP2pTarget(client2Id);
        expect(connectionSuccess).to.be(true);
        client1.emit2(eventC1ToC2, dataC1ToC2);
        await toC2FromC1EventListener;
        expect(c2Result).to.be(dataC1ToC2);
        await client1.unregisterP2pTarget();

        connectionSuccess = await client3.registerP2pTarget(client1Id);
        expect(connectionSuccess).to.be(true);
        client1.emit2(eventC1ToC3, dataC1ToC3);
        await toC3FromC1EventListener;
        expect(c3Result).to.be(dataC1ToC3)
        await client1.unregisterP2pTarget();

        connectionSuccess = await client3.registerP2pTarget(client2Id);
        expect(connectionSuccess).to.be(true);
        client3.emit2(eventC3ToC2, dataC3ToC2);
        await toC2FromC3EventListener;
        expect(c2Result).to.be(dataC3ToC2);
        await client2.unregisterP2pTarget();
      });
      it('should throw error if targetClientId is not set', function () {
        expect(client1.emit2.bind(client1, 'testEvent')).to.throwError();
      });
      it('should throw error if event is not specified', async function () {
        const connectionSuccess = await client1.registerP2pTarget(client2Id);
        expect(connectionSuccess).to.be(true);
        expect(client1.emit2.bind(client1)).to.throwError();
      });
      describe('in no ack case', function () {
        it('should emit an event to connected client', async function () {
          const connectionSuccess = await client1.registerP2pTarget(client2Id);
          expect(connectionSuccess).to.be(true);

          const event = 'testEvent';
          let testResult = 1;
          const eventListener = new Promise(resolve => {
            client2.on(event, () => {
              testResult = 2;
              resolve();
            })
          });

          client1.emit2(event);
          await eventListener;
          expect(testResult).to.be(2);
        });
        it('should emit an event to connected client with arguments', async function () {
          const connectionSuccess = await client1.registerP2pTarget(client2Id);
          expect(connectionSuccess).to.be(true);

          const event = 'testEvent';
          let testResult1, testResult2, testResult3;
          const arg1 = 123;
          const arg2 = 'a string';
          const arg3 = false;

          const eventListener = new Promise(resolve => {
            client2.on(event, (arg1, arg2, arg3) => {
              testResult1 = arg1;
              testResult2 = arg2;
              testResult3 = arg3;
              resolve();
            })
          });

          client1.emit2(event, arg1, arg2, arg3);
          await eventListener;
          expect(testResult1).to.be(arg1);
          expect(testResult2).to.be(arg2);
          expect(testResult3).to.be(arg3);
        });
      })
      describe('in ack case', function () {
        it('should emit an event to connected client', async function () {
          const connectionSuccess = await client1.registerP2pTarget(client2Id);
          expect(connectionSuccess).to.be(true);

          const event = 'testEvent';
          let testResult = 1;
          let ack = false;
          const emitAck = new Promise(resolve => {
            client2.on(event, (ackFn) => {
              testResult = 2;
              ackFn();
            });

            client1.emit2(event, () => {
              ack = true;
              resolve();
            });
          });

          await emitAck;
          expect(testResult).to.be(2);
          expect(ack).to.be(true);
        });
        it('should emit an event to connected client with arguments', async function () {
          const connectionSuccess = await client1.registerP2pTarget(client2Id);
          expect(connectionSuccess).to.be(true);

          const event = 'testEvent';
          let testResult1, testResult2, testResult3, testResult4;
          const arg1 = 123;
          const arg2 = 'a string';
          const arg3 = false;

          const eventListener = new Promise(resolve => {
            client2.on(event, (arg1, arg2, arg3, ackFn) => {
              testResult1 = arg1;
              testResult2 = arg2;
              testResult3 = arg3;
              ackFn();
              resolve();
            })
          });

          const emitAck = new Promise(resolve => {
            client1.emit2(event, arg1, arg2, arg3, () => {
              testResult4 = 'ack';
              resolve();
            });
          });

          await eventListener;
          expect(testResult1).to.be(arg1);
          expect(testResult2).to.be(arg2);
          expect(testResult3).to.be(arg3);
          await emitAck;
          expect(testResult4).to.be('ack');
        });
        it('should execute ack function after target client receives the event', async function () {
          const connectionSuccess = await client1.registerP2pTarget(client2Id);
          expect(connectionSuccess).to.be(true);

          const event = 'testEvent';
          let testResult = 'no ack';
          const eventListener = new Promise(resolve => {
            client2.on(event, (ackFn) => {
              testResult = 2;
              ackFn();
              resolve();
            })
          });

          const emitAck = new Promise(resolve => {
            client1.emit2(event, () => {
              testResult = 'ack';
              resolve();
            });
          });

          await emitAck;
          expect(testResult).to.be('ack');
        });
      })
    })
    describe('getClientList function', function () {
      this.timeout(5000);

      it('should list all connected client ids', async function () {
        let clientList = await client1.getClientList();
        expect(clientList).to.have.length(3);
        expect(clientList).to.contain(client1Id);
        expect(clientList).to.contain(client2Id);
        expect(clientList).to.contain(client3Id);
        // Ensure that result should be the same with different clients
        clientList = await client2.getClientList();
        expect(clientList).to.have.length(3);
        expect(clientList).to.contain(client1Id);
        expect(clientList).to.contain(client2Id);
        expect(clientList).to.contain(client3Id);

        clientList = await client3.getClientList();
        expect(clientList).to.have.length(3);
        expect(clientList).to.contain(client1Id);
        expect(clientList).to.contain(client2Id);
        expect(clientList).to.contain(client3Id);
      })

      it('should show server\'s clientMap correctly ', async function () {
        await wait(500);
        client1.disconnect();
        await wait(200);
        let clientList = await client3.getClientList();
        expect(clientList).to.have.length(2);

        client2.disconnect();
        await wait(200);
        clientList = await client3.getClientList();
        expect(clientList).to.have.length(1);
      })
    });
  })
})
