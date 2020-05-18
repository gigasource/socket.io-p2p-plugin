const {
  CLIENT_CONNECTION_CHANNEL,
  CLIENT_DISCONNECTION_CHANNEL,
  EMIT_TO_JOB_CHANNEL,
  ACK_CHANNEL_PREFIX,
  EMIT_TO_PERSISTENT_ACK_CHANNEL,
} = require('../../../util/constants').REDIS_KEYS;
const uuidv1 = require('uuid/v1');
const kareem = require('../../../util/hooks');
const {HOOK_NAME: {POST_EMIT_TO, POST_EMIT_TO_PERSISTENT_ACK}} = require('../../../util/constants');

module.exports = function (io, serverPlugin) {
  const uuid = uuidv1();
  const redisPubClient = io._adapter.pubClient;
  const redisSubClient = io._adapter.subClient;
  const virtualClientIdSet = new Set();
  const acks = {};

  redisSubClient.subscribe(CLIENT_CONNECTION_CHANNEL);
  redisSubClient.subscribe(CLIENT_DISCONNECTION_CHANNEL);
  redisSubClient.subscribe(EMIT_TO_JOB_CHANNEL);
  redisSubClient.subscribe(ACK_CHANNEL_PREFIX + uuid);
  redisSubClient.subscribe(EMIT_TO_PERSISTENT_ACK_CHANNEL);

  redisSubClient.on('message', function (channel, message) {
    switch (channel) {
      case CLIENT_CONNECTION_CHANNEL: {
        const clientId = JSON.parse(message);
        virtualClientIdSet.add(clientId);
        break;
      }
      case CLIENT_DISCONNECTION_CHANNEL: {
        const clientId = JSON.parse(message);
        virtualClientIdSet.delete(clientId);
        break;
      }
      case EMIT_TO_JOB_CHANNEL: {
        const [originId, targetClientId, event, args, ackId] = JSON.parse(message);

        if (uuid === originId) return; //ignore message sent from self
        if (!serverPlugin.getSocketByClientId(targetClientId)) return;

        const emitArgs = [targetClientId, event, ...args];
        if (ackId) emitArgs.push((...ackArgs) => {
          redisPubClient.publish(ACK_CHANNEL_PREFIX + originId, JSON.stringify([ackId, ackArgs]));
        });

        serverPlugin.emitTo(...emitArgs);

        break;
      }
      case EMIT_TO_PERSISTENT_ACK_CHANNEL: {
        const [originId, ackFnName, argArray] = JSON.parse(message);
        if (uuid === originId) return; //ignore message sent from self

        const ackFunctions = serverPlugin.ackFunctions[ackFnName] || [];
        if (ackFunctions.length > 0) ackFunctions.forEach(fn => fn(...argArray));
        break;
      }
      case ACK_CHANNEL_PREFIX + uuid: {
        const [ackId, ackArgs] = JSON.parse(message)

        const ack = acks[ackId]
        if (!ack) return;

        ack(...ackArgs);
        break;
      }
    }
  });

  io.on('connect', socket => {
    const {clientId} = socket.request._query;
    if (!clientId) return

    redisPubClient.publish(CLIENT_CONNECTION_CHANNEL, JSON.stringify(clientId));

    socket.once('disconnect', () => redisPubClient.publish(CLIENT_DISCONNECTION_CHANNEL, JSON.stringify(clientId)));
  });

  kareem.post(POST_EMIT_TO, function (targetClientId, event, args, done) {
    if (!virtualClientIdSet.has(targetClientId)) {
      done(`Client ${targetClientId} is not connected to server`);
    } else {
      const publishMessage = [uuid, targetClientId, event, args];

      if (typeof args[args.length - 1] === "function") {
        const callback = args.pop();

        const ackId = uuidv1();
        publishMessage.push(ackId);
        acks[ackId] = callback;
      }

      redisPubClient.publish(EMIT_TO_JOB_CHANNEL, JSON.stringify(publishMessage))
    }
  });

  kareem.post(POST_EMIT_TO_PERSISTENT_ACK, function (ackFnName, argArray) {
    const publishMessage = [uuid, ackFnName, argArray];

    redisPubClient.publish(EMIT_TO_PERSISTENT_ACK_CHANNEL, JSON.stringify(publishMessage));
  });
}
