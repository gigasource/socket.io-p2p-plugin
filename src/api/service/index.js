const {SOCKET_EVENT, SOCKET_EVENT_ACTION} = require('../../util/constants');
const flatten = require('lodash').flatten;

// Note: 'topic' is equivalent to 'room'
class P2pServiceApi {
  constructor(socket, p2pMultiMessageApi, serviceName) {
    this.socket = socket;
    this.p2pMultiMessageApi = p2pMultiMessageApi;
    this.serviceName = serviceName;
    this._topicNameTranslator = null; // Add translator if you need to manipulate topicName

    this.provideService(SOCKET_EVENT.SUBSCRIBE_TOPIC, (...args) => {
      let [clientId, topicName, callback] = args;

      if (topicName) {
        try {
          topicName = this.translateTopicName(topicName);
        } catch (err) {
          callback(err);
        }

        this.socket.emit(SOCKET_EVENT.JOIN_ROOM,
          SOCKET_EVENT_ACTION.CLIENT_SUBSCRIBE_TOPIC,
          clientId, topicName, callback);

        callback();
      } else {
        callback(new Error('topicName can not be empty'));
      }
    });
    this.provideService(SOCKET_EVENT.UNSUBSCRIBE_TOPIC, (...args) => {
      let [clientId, topicName, callback] = args;

      if (topicName) {
        try {
          topicName = this.translateTopicName(topicName);
        } catch (err) {
          callback(err);
        }

        this.socket.emit(SOCKET_EVENT.LEAVE_ROOM,
          SOCKET_EVENT_ACTION.CLIENT_UNSUBSCRIBE_TOPIC,
          clientId, topicName, callback);

        callback();
      } else {
        callback(new Error('topicName can not be empty'));
      }
    });
  }

  emitService(service, api, ...args) {
    const eventName = `service:${service}:api:${api}`;
    this.p2pMultiMessageApi.emitTo(service, eventName, ...args);
  }

  provideService(api, callback) {
    const eventName = `service:${this.serviceName}:api:${api}`;
    this.p2pMultiMessageApi.onAny(eventName, callback);
  }

  emitClient(clientId, api, ...args) {
    this.p2pMultiMessageApi.emitTo(clientId, api, ...args);
  }

  onService(serviceName, api, callback) {
    this.p2pMultiMessageApi.from(serviceName).on(api, callback);
  }

  publishTopic(topicName, ...args) {
    try {
      this.socket.emit(SOCKET_EVENT.EMIT_ROOM, topicName, SOCKET_EVENT.DEFAULT_TOPIC_EVENT, ...args);
    } catch (err) {
      console.error(err.stack);
    }
  }

  createTopic(...topicNames) {
    topicNames = flatten(topicNames);
    topicNames.forEach(topicName => {
      this.socket.emit(SOCKET_EVENT.JOIN_ROOM, topicName);
    });
  }

  destroyTopic(...topicNames) {
    topicNames = flatten(topicNames);
    topicNames.forEach(topicName => {
      this.socket.emit(SOCKET_EVENT.LEAVE_ROOM,
        SOCKET_EVENT_ACTION.SERVICE_UNSUBSCRIBE_TOPIC,
        topicName);
    });
  }

  subscribeTopic(service, topicName, callback) {
    this.emitService(service, SOCKET_EVENT.SUBSCRIBE_TOPIC,
      this.p2pMultiMessageApi.clientId, topicName, (err) => {
        if (err) {
          console.error(err.stack);
          return;
        }

        this.socket.on(SOCKET_EVENT.DEFAULT_TOPIC_EVENT, callback);
      });
  }

  unsubscribeTopic(service, topicName) {
    this.emitService(service, SOCKET_EVENT.UNSUBSCRIBE_TOPIC,
      this.p2pMultiMessageApi.clientId, topicName, (err) => {
        if (err) console.error(err.stack);
      });
  }

  translateTopicName(topicName) {
    if (!this._topicNameTranslator) return topicName;

    if (typeof this._topicNameTranslator !== 'function')
      throw new Error('_topicNameTranslator can only be null or a function');

    return this._topicNameTranslator(topicName);
  }
}

module.exports = P2pServiceApi;
