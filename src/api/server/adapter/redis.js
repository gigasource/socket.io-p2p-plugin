const uuidv1 = require('uuid/v1');
const {
  SERVER_CONFIG: {SERVER_SIDE_SOCKET_ID_POSTFIX},
  HOOK_NAME: {POST_EMIT_TO, POST_EMIT_TO_PERSISTENT_ACK},
  INTERNAL_EMITTER_EVENT: {DATA_FROM_ANOTHER_SERVER},
  REDIS_KEYS: {
    CLIENT_CONNECTION_CHANNEL,
    CLIENT_DISCONNECTION_CHANNEL,
    EMIT_TO_CHANNEL,
    ACK_CHANNEL_PREFIX,
    EMIT_TO_PERSISTENT_ACK_CHANNEL,
  },
} = require('../../../util/constants');

module.exports = function (io, serverPlugin) {
  const uuid = uuidv1();
  const redisPubClient = io._adapter.pubClient;
  const redisSubClient = io._adapter.subClient;
  const clusterClients = new Set();
  const acks = {};
  const reviverFn = (key, value) => {
    if (value && value.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data);

    return value;
  }

  redisSubClient.subscribe(CLIENT_CONNECTION_CHANNEL);
  redisSubClient.subscribe(CLIENT_DISCONNECTION_CHANNEL);
  redisSubClient.subscribe(EMIT_TO_CHANNEL);
  redisSubClient.subscribe(ACK_CHANNEL_PREFIX + uuid);
  redisSubClient.subscribe(EMIT_TO_PERSISTENT_ACK_CHANNEL);

  redisSubClient.on('message', function (channel, message) {
    switch (channel) {
        // Client connection/disconnection handlers
      case CLIENT_CONNECTION_CHANNEL: {
        const clientId = JSON.parse(message);
        clusterClients.add(clientId);
        break;
      }
      case CLIENT_DISCONNECTION_CHANNEL: {
        const clientId = JSON.parse(message);
        clusterClients.delete(clientId);
        break;
      }

        // emitTo & emitToPersistent handler
      case EMIT_TO_CHANNEL: {
        const [originId, targetClientId, event, args, ackId] = JSON.parse(message, reviverFn);

        if (uuid === originId) return; //ignore message sent from self

        const emitArgs = [targetClientId, event, ...args];
        if (ackId) emitArgs.push((...ackArgs) => {
          redisPubClient.publish(ACK_CHANNEL_PREFIX + originId, JSON.stringify([ackId, ackArgs]));
        });

        //emitTo requires a real socket
        if (serverPlugin.getSocketByClientId(targetClientId)) serverPlugin.emitTo(...emitArgs);

        //see explanation for virtualClients in Server Core API
        else if (serverPlugin.virtualClients.has(targetClientId)) serverPlugin.$emit(DATA_FROM_ANOTHER_SERVER, ...emitArgs);
        break;
      }
      case EMIT_TO_PERSISTENT_ACK_CHANNEL: {
        const [originId, ackFnName, argArray] = JSON.parse(message, reviverFn);
        if (uuid === originId) return; //ignore message sent from self

        const ackFunctions = serverPlugin.ackFunctions[ackFnName] || [];
        if (ackFunctions.length > 0) ackFunctions.forEach(fn => fn(...argArray));
        break;
      }
        // support for ack functions between nodes
      case ACK_CHANNEL_PREFIX + uuid: {
        const [ackId, ackArgs] = JSON.parse(message, reviverFn);

        const ack = acks[ackId];
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

  io.kareem.post(POST_EMIT_TO, function (targetClientId, event, args, done) {
    if (!clusterClients.has(targetClientId) && !targetClientId.endsWith(SERVER_SIDE_SOCKET_ID_POSTFIX)) {
      done(`Client ${targetClientId} is not connected to server`);
    } else {
      const publishMessage = [uuid, targetClientId, event, args];

      if (typeof args[args.length - 1] === "function") {
        const callback = args.pop();

        const ackId = uuidv1();
        publishMessage.push(ackId);
        acks[ackId] = callback;
      }

      redisPubClient.publish(EMIT_TO_CHANNEL, JSON.stringify(publishMessage))
    }
  });

  io.kareem.post(POST_EMIT_TO_PERSISTENT_ACK, function (ackFnName, argArray) {
    const publishMessage = [uuid, ackFnName, argArray];

    redisPubClient.publish(EMIT_TO_PERSISTENT_ACK_CHANNEL, JSON.stringify(publishMessage));
  });
}
