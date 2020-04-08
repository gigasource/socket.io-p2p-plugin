const {SOCKET_EVENT} = require('../../util/constants');
const flatten = require('lodash/flatten');

class P2pClientCoreApi {
  constructor(socket, clientId) {
    this.socket = socket;
    this.clientId = clientId;
    this.subscribedTopics = new Set();

    this.socket.on(SOCKET_EVENT.SERVER_ERROR, (err) => console.error(`Error sent from server to client '${this.clientId}': ${err}`));
  }

  joinRoom(...args) {
    this.socket.emit(SOCKET_EVENT.JOIN_ROOM, ...args);
  }

  leaveRoom(...args) {
    this.socket.emit(SOCKET_EVENT.LEAVE_ROOM, ...args);
  }

  emitRoom(...args) {
    this.socket.emit(SOCKET_EVENT.EMIT_ROOM, ...args);
  }

  createTopic(topicNames, callback) {
    topicNames = flatten([topicNames]);

    topicNames.forEach(topicName => {
      if (!topicName || typeof topicName !== 'string') throw new Error(`A string is required for topic name, got ${typeof topicName} instead`);

      this.socket.emit(SOCKET_EVENT.CHECK_TOPIC_NAME, topicName, topicNameExisted => {
        if (topicNameExisted) throw new Error(`Another service has registered topic with name ${topicName}, topic name must be unique`);
        else this.socket.emit(SOCKET_EVENT.CREATE_TOPIC, topicName, callback);
      });
    });
  }

  destroyTopic(topicNames, callback) {
    topicNames = flatten([topicNames]);

    topicNames.forEach(topicName => {
      if (!topicName || typeof topicName !== 'string') throw new Error(`A string is required for topic name, got ${typeof topicName} instead`);

      this.socket.emit(SOCKET_EVENT.CHECK_TOPIC_NAME, topicName, topicNameExisted => {
        if (topicNameExisted) this.socket.emit(SOCKET_EVENT.DESTROY_TOPIC, topicName, callback);
      });
    });
  }

  publishTopic(topicName, ...args) {
    if (!topicName || typeof topicName !== 'string') throw new Error(`A string is required for topic name, got ${typeof topicName} instead`);

    this.socket.emit(SOCKET_EVENT.EMIT_ROOM, topicName, `${topicName}-${SOCKET_EVENT.DEFAULT_TOPIC_EVENT}`, ...args);
  }

  subscribeTopic(topicName, callback) {
    if (this.subscribedTopics.has(topicName)) return;

    this.socket.emit(SOCKET_EVENT.CHECK_TOPIC_NAME, topicName, topicNameExisted => {
      if (topicNameExisted) {
        this.socket.emit(SOCKET_EVENT.JOIN_ROOM, topicName, () => {
          this.subscribedTopics.add(topicName);
          this.socket.on(`${topicName}-${SOCKET_EVENT.DEFAULT_TOPIC_EVENT}`, callback);
          this.socket.once(`${topicName}-${SOCKET_EVENT.TOPIC_BEING_DESTROYED}`, () => {
            this.socket.off(`${topicName}-${SOCKET_EVENT.DEFAULT_TOPIC_EVENT}`, callback);
          });
        });
      } else {
        throw new Error(`Topic ${topicName} is not yet created`);
      }
    });
  }

  unsubscribeTopic(topicName) {
    if (!this.subscribedTopics.has(topicName)) return;

    this.socket.emit(SOCKET_EVENT.LEAVE_ROOM, topicName, () => {
      this.subscribedTopics.delete(topicName);
      this.socket.off(`${topicName}-${SOCKET_EVENT.DEFAULT_TOPIC_EVENT}`);
      this.socket.off(`${topicName}-${SOCKET_EVENT.TOPIC_BEING_DESTROYED}`);
    });
  }
}

module.exports = P2pClientCoreApi;
