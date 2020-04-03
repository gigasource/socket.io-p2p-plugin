const {SOCKET_EVENT} = require('../../util/constants');
const flatten = require('lodash/flatten');
const pull = require('lodash/pull');
const reject = require('lodash/reject');
const {modifyTopicName} = require('../../util/common');

class P2pServerServiceApi {
  constructor(coreApi) {
    this.coreApi = coreApi;
    this.serviceApis = {};
    this.createdTopics = []

    /** serviceApis Example:
     [
     'job:update': [{function, function}], // the 2nd function is the modified version of the original handler
     // Modified callback is needed because we need to mutate the parameters passed to the original callback (shift() the params to remove target client ID)
     // And to use socket.off on a specific callback, we need to store the original callback
     ]
     **/

    this.interceptor = (service, api, args) => {
      const apiName = `${service}:${api}`;
      if (!this.serviceApis[apiName]) return false;

      this.serviceApis[apiName].forEach(({callback, newCallback}) => {
        if (newCallback) newCallback.apply(this, args);
        else callback.apply(this, args);
      });

      return true;
    };
  }

  interceptP2pEmit(socket) {
    this.socket = socket;
    socket.removeAllListeners(SOCKET_EVENT.P2P_EMIT);
    socket.removeAllListeners(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE);

    const emitListener = new Proxy(this.coreApi.p2pEmitListener, {
      apply: (target, thisArg, argArray) => {
        const [{targetClientId, event, args}] = argArray;
        if (this.interceptor(targetClientId, event, args)) return;
        return target.apply(thisArg, argArray);
      }
    });

    const emitAckListener = new Proxy(this.coreApi.p2pEmitAckListener, {
      apply: (target, thisArg, argArray) => {
        const [{targetClientId, event, args}, ackFn] = argArray;
        if (this.interceptor(targetClientId, event, [...args, ackFn])) return;
        return target.apply(thisArg, argArray);
      }
    });

    socket.on(SOCKET_EVENT.P2P_EMIT, emitListener);
    socket.on(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE, emitAckListener);
  }

  asService(serviceName) {
    this.selectedService = serviceName;
    return this;
  }

  initTopicApis(service) {
    const subscribeApi = `${service}:${SOCKET_EVENT.SUBSCRIBE_TOPIC}`;
    const unsubscribeApi = `${service}:${SOCKET_EVENT.UNSUBSCRIBE_TOPIC}`;

    if (!this.serviceApis[subscribeApi]) {
      const subscribeTopicListener = (...args) => {
        args.shift();
        let [clientId, topicName, callback] = args;
        const socket = this.coreApi.getSocketByClientId(clientId);

        if (!topicName) {
          if (callback) callback('topicName can not be empty');
          return;
        }

        if (!socket) {
          if (callback) callback(`client ${clientId} is not connected to p2p server`);
          return;
        }

        topicName = modifyTopicName(service, topicName);
        socket.join(topicName);
        if (callback) callback();
      }
      this.serviceApis[subscribeApi] = [{callback: subscribeTopicListener}];
    }

    if (!this.serviceApis[unsubscribeApi]) {
      const unsubscribeTopicListener = (...args) => {
        args.shift();
        let [clientId, topicName] = args;
        const socket = this.coreApi.getSocketByClientId(clientId);

        if (!topicName || !socket) return;

        topicName = modifyTopicName(service, topicName);
        socket.leave(topicName);
      }
      this.serviceApis[unsubscribeApi] = [{callback: unsubscribeTopicListener}];
    }
  }

  provideService(api, callback) {
    const service = this.selectedService;
    const apiName = `${service}:${api}`;

    this.initTopicApis(service);

    const newCallback = new Proxy(callback, {
      apply: (target, thisArg, argArray) => {
        argArray.shift(); // clients use emitTo, which unshift the caller id to the argArray
        return target.apply(thisArg, argArray);
      }
    });

    this.serviceApis[apiName] = this.serviceApis[apiName] || [];
    this.serviceApis[apiName].push({callback, newCallback});
  }

  destroyService(api, callback) {
    const service = this.selectedService;
    const apiName = `${service}:${api}`;

    if (!api && !callback) {
      Object.keys(this.serviceApis).forEach(apiName => {
        if (apiName.startsWith(`${service}:`)) {
          delete this.serviceApis[apiName];
          this.initTopicApis(service); // re-init topic APIs after clearing all APIs
        }
      });
    } else {
      const listeners = this.serviceApis[apiName];
      if (!listeners) return;

      if (callback) {
        this.serviceApis[apiName] = reject(listeners, {callback});
      } else {
        delete this.serviceApis[apiName];
      }
    }
  }

  destroyAllServices() {
    const serviceNames = [];

    Object.keys(this.serviceApis).forEach(apiName => {
      const serviceName = apiName.split(':')[0];
      if (!serviceNames.includes(serviceName)) serviceNames.push(serviceName);
    });

    this.serviceApis = {};

    serviceNames.forEach(serviceName => this.initTopicApis(serviceName));
  }

  emitClient(targetClientId, event, ...args) {
    const targetClientSocket = this.coreApi.getSocketByClientId(targetClientId);

    if (!targetClientSocket) {
      console.error(new Error(`Can not find socket of client ${targetClientId}`));
      return;
    }

    args.unshift(this.selectedService);

    if (typeof args[args.length - 1] === 'function') {
      const ack = args.pop();
      targetClientSocket.emit(event, ...args, ack);
    } else targetClientSocket.emit(event, ...args);
  }

  createTopic(...topicNames) {
    topicNames = flatten(topicNames);
    topicNames.forEach(topicName => {
      if (!topicName || typeof topicName !== 'string') {
        console.error(`createTopic error: a string is required for topic name, got ${topicName} instead`);
        return;
      }
      if (this.createdTopics.includes(topicName)) return;

      this.initTopicApis(this.selectedService);
      topicName = modifyTopicName(this.selectedService, topicName);
      this.createdTopics.push(topicName);
      this.socket.join(topicName);
    });
  }

  destroyTopic(...topicNames) {
    topicNames = flatten(topicNames);
    topicNames.forEach(topicName => {
      if (!topicName || typeof topicName !== 'string') {
        console.error(`destroyTopic error: a string is required for topic name, got ${topicName} instead`);
        return;
      }

      topicName = modifyTopicName(this.selectedService, topicName);
      if (!this.createdTopics.includes(topicName)) return;

      pull(this.createdTopics, topicName);
      const socketsInRoom = this.coreApi.io.sockets.adapter.rooms[topicName].sockets;

      if (socketsInRoom) {
        Object.keys(socketsInRoom).forEach(key => {
          const sk = this.coreApi.io.sockets.connected[key];
          sk.emit(`${topicName}-${SOCKET_EVENT.TOPIC_BEING_DESTROYED}`);
          sk.leave(topicName, null);
        });
      }
    });
  }

  publishTopic(topicName, ...args) {
    if (!topicName || typeof topicName !== 'string') throw new Error(`A string is required for topic name, got ${topicName} instead`);

    topicName = modifyTopicName(this.selectedService, topicName);
    if (!this.createdTopics.includes(topicName)) throw new Error(`topic ${topicName} is not yet created`);

    this.coreApi.io.to(topicName).emit(`${topicName}-${SOCKET_EVENT.DEFAULT_TOPIC_EVENT}`, ...args);
  }
}

module.exports = P2pServerServiceApi;
