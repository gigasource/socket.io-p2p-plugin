const {SOCKET_EVENT, SOCKET_EVENT_ACTION} = require('../../util/constants');
const flatten = require('lodash/flatten');
const pull = require('lodash/pull');
const {modifyTopicName} = require('../../util/common');

// Note: 'topic' is equivalent to 'room' of Socket.IO
class P2pServiceApi {
  constructor(socket, p2pMultiMessageApi) {
    this.socket = socket;
    this.p2pMultiMessageApi = p2pMultiMessageApi;
    this.createdTopics = []
    this.subscribedTopics = [];
  }

  initTopicListeners() {
    this.provideService(SOCKET_EVENT.SUBSCRIBE_TOPIC, (...args) => {
      let [clientId, topicName, callback] = args;

      // validity check for topicName is on client side (subscribeTopic)
      if (topicName) {
        topicName = modifyTopicName(this.p2pMultiMessageApi.clientId, topicName);
        this.socket.emit(SOCKET_EVENT.JOIN_ROOM, SOCKET_EVENT_ACTION.CLIENT_SUBSCRIBE_TOPIC, clientId, topicName, callback);
        callback();
      }
    });
    this.provideService(SOCKET_EVENT.UNSUBSCRIBE_TOPIC, (...args) => {
      let [clientId, topicName] = args;

      // validity check for topicName is on client side (subscribeTopic)
      if (topicName) {
        topicName = modifyTopicName(this.p2pMultiMessageApi.clientId, topicName);
        this.socket.emit(SOCKET_EVENT.LEAVE_ROOM, SOCKET_EVENT_ACTION.CLIENT_UNSUBSCRIBE_TOPIC, clientId, topicName);
      }
    });
  }

  emitService(service, api, ...args) {
    this.p2pMultiMessageApi.emitTo(service, api, ...args);
  }

  provideService(api, callback) {
    this.p2pMultiMessageApi.onAny(api, callback);
  }

  destroyService(api, callback) {
    this.p2pMultiMessageApi.offAny(api, callback);
    if(!api && !callback) this.initTopicListeners(); // re-init topic listeners after clearing all APIs
  }

  emitClient(clientId, api, ...args) {
    this.p2pMultiMessageApi.emitTo(clientId, api, ...args);
  }

  onService(serviceName, api, callback) {
    this.p2pMultiMessageApi.from(serviceName).on(api, callback);
  }

  createTopic(...topicNames) {
    topicNames = flatten(topicNames);
    topicNames.forEach(topicName => {
      if (!topicName || typeof topicName !== 'string') {
        console.error(`createTopic error: a string is required for topic name, got ${topicName} instead`);
        return;
      }
      if (this.createdTopics.includes(topicName)) return;

      topicName = modifyTopicName(this.p2pMultiMessageApi.clientId, topicName);
      this.createdTopics.push(topicName);
      this.socket.emit(SOCKET_EVENT.JOIN_ROOM, SOCKET_EVENT_ACTION.SERVICE_CREATE_TOPIC, topicName);
    });
  }

  destroyTopic(...topicNames) {
    topicNames = flatten(topicNames);
    topicNames.forEach(topicName => {
      if (!topicName || typeof topicName !== 'string') {
        console.error(`destroyTopic error: a string is required for topic name, got ${topicName} instead`);
        return;
      }

      topicName = modifyTopicName(this.p2pMultiMessageApi.clientId, topicName);
      if (!this.createdTopics.includes(topicName)) return;

      pull(this.createdTopics, topicName);
      this.socket.emit(SOCKET_EVENT.LEAVE_ROOM, SOCKET_EVENT_ACTION.SERVICE_DESTROY_TOPIC, topicName);
    });
  }

  publishTopic(topicName, ...args) {
    if (!topicName || typeof topicName !== 'string') throw new Error(`A string is required for topic name, got ${topicName} instead`);

    topicName = modifyTopicName(this.p2pMultiMessageApi.clientId, topicName);
    if (!this.createdTopics.includes(topicName)) throw new Error(`topic ${topicName} is not yet created`);

    this.socket.emit(SOCKET_EVENT.EMIT_ROOM, topicName, `${topicName}-${SOCKET_EVENT.DEFAULT_TOPIC_EVENT}`, ...args);
  }

  subscribeTopic(service, topicName, callback) {
    if (!service || !topicName || !callback) throw new Error('3 truthy parameter are required');
    if (typeof service !== 'string' || typeof topicName !== 'string') throw new Error('service & topicName must be strings');

    this.emitService(service, SOCKET_EVENT.SUBSCRIBE_TOPIC, this.p2pMultiMessageApi.clientId, topicName, () => {
        topicName = modifyTopicName(service, topicName);
        if (!this.subscribedTopics.includes(topicName)) this.subscribedTopics.push(topicName);
        this.socket.on(`${topicName}-${SOCKET_EVENT.DEFAULT_TOPIC_EVENT}`, callback);
        this.socket.once(`${topicName}-${SOCKET_EVENT.TOPIC_BEING_DESTROYED}`, () => {
          this.socket.off(`${topicName}-${SOCKET_EVENT.DEFAULT_TOPIC_EVENT}`, callback);
        });
      });
  }

  unsubscribeTopic(service, topicName) {
    if (!service || !topicName) throw new Error('service & topicName parameter are required');
    if (typeof service !== 'string' || typeof topicName !== 'string') throw new Error('service & topicName must be strings');

    topicName = modifyTopicName(service, topicName);
    if (!this.subscribedTopics.includes(topicName)) return; // throw Error is not necessary

    pull(this.subscribedTopics, topicName);
    this.emitService(service, SOCKET_EVENT.UNSUBSCRIBE_TOPIC, this.p2pMultiMessageApi.clientId, topicName);
    this.socket.off(`${topicName}-${SOCKET_EVENT.DEFAULT_TOPIC_EVENT}`);
    this.socket.off(`${topicName}-${SOCKET_EVENT.TOPIC_BEING_DESTROYED}`);
  }
}

module.exports = P2pServiceApi;
