const uuidv1 = require('uuid/v1');
const {
  SERVER_CONFIG: {SERVER_SIDE_SOCKET_ID_POSTFIX},
  HOOK_NAME: {POST_EMIT_TO, POST_EMIT_TO_PERSISTENT_ACK},
  INTERNAL_EMITTER_EVENT: {DATA_FROM_ANOTHER_SERVER},
  REDIS_KEYS: {
    UPDATE_CLIENT_LIST_CHANNEL,
    EMIT_TO_CHANNEL,
    ACK_CHANNEL_PREFIX,
    EMIT_TO_PERSISTENT_ACK_CHANNEL,
    REDIS_CLIENT_ID_KEY_PREFIX,
  },
} = require('../../../util/constants');

module.exports = function (io, serverPlugin) {
  const thisUuid = uuidv1();
  const redisPubClient = io._adapter.pubClient;
  const redisSubClient = io._adapter.subClient;
  const acks = {};
  const reviverFn = (key, value) => {
    if (value && value.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data);

    return value;
  }

  function getClusterClientIds(callback) {
    if (callback) {
      redisPubClient.keys(REDIS_CLIENT_ID_KEY_PREFIX + '*', (err, keys) => {
        if (err) callback(err);
        else callback(null, keys.map(key => key.slice(REDIS_CLIENT_ID_KEY_PREFIX.length)));
      });
    } else {
      return new Promise((resolve, reject) => {
        redisPubClient.keys(REDIS_CLIENT_ID_KEY_PREFIX + '*', (err, keys) => {
          if (err) reject(err);
          else keys.map(key => key.slice(REDIS_CLIENT_ID_KEY_PREFIX.length));
        });
      });
    }
  }

  /*
    this is a local copy of cluster client list, it may not be accurate but it's needed for emitTo
    if getClusterClientIds function is used on every emitTo calls, performance will be affected
   */
  io.clusterClients = new Set();

  /*
    use this function to get an accurate list of clients connected to cluster
   */
  io.getClusterClientIds = getClusterClientIds;

  getClusterClientIds((error, clusterClientIds) => {
    if (error) console.error(error);
    clusterClientIds.forEach(clientId => io.clusterClients.add(clientId));
  });

  redisSubClient.subscribe(UPDATE_CLIENT_LIST_CHANNEL);
  redisSubClient.subscribe(EMIT_TO_CHANNEL);
  redisSubClient.subscribe(ACK_CHANNEL_PREFIX + thisUuid);
  redisSubClient.subscribe(EMIT_TO_PERSISTENT_ACK_CHANNEL);

  redisSubClient.on('message', async function (channel, message) {
    switch (channel) {
        // Client connection/disconnection handlers
      case UPDATE_CLIENT_LIST_CHANNEL: {
        try {
          const clusterClientIds = await getClusterClientIds();
          const newClusterClientSet = new Set();
          clusterClientIds.forEach(clientId => newClusterClientSet.add(clientId));

          io.clusterClients = newClusterClientSet;
        } catch (e) {
          console.error(e);
        }
        break;
      }

        // emitTo & emitToPersistent handler
      case EMIT_TO_CHANNEL: {
        const [originId, targetClientId, event, args, ackId] = JSON.parse(message, reviverFn);

        if (thisUuid === originId) return; //ignore message sent from self

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
        if (thisUuid === originId) return; //ignore message sent from self

        const ackFunctions = serverPlugin.ackFunctions[ackFnName] || [];
        if (ackFunctions.length > 0) ackFunctions.forEach(fn => fn(...argArray));
        break;
      }
        // support for ack functions between nodes
      case ACK_CHANNEL_PREFIX + thisUuid: {
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

    const clientIdKey = REDIS_CLIENT_ID_KEY_PREFIX + clientId;
    io.clusterClients.add(clientId);

    redisPubClient.set(clientIdKey, thisUuid, err => {
      if (err) console.error(err);
      redisPubClient.publish(UPDATE_CLIENT_LIST_CHANNEL, '');
    });

    socket.once('disconnect', () => {
      io.clusterClients.delete(clientId);

      // Use watch to make sure the key's value is not modified in between the commands
      redisPubClient.watch(clientIdKey, watchError => {
        if (watchError) console.error(watchError);
        else {
          redisPubClient.get(clientIdKey, (getError, instanceUuid) => {
            if (getError) {
              console.error(getError);
            } else if (instanceUuid === thisUuid) {
              redisPubClient.multi().del(clientIdKey).exec((execError, replies) => {
                if (execError) console.error(execError);
                redisPubClient.publish(UPDATE_CLIENT_LIST_CHANNEL, '');
                /*
                  NOTE: if execError === null && replies === null, it means that the key's value was modified in the middle
                        of the transaction

                        if execError === null && replies !== null, it means that the transaction was successful
                 */
              });
            }
          });
        }
      });
    });
  });

  io.kareem.post(POST_EMIT_TO, function (targetClientId, event, args, done) {
    if (!io.clusterClients.has(targetClientId) && !targetClientId.endsWith(SERVER_SIDE_SOCKET_ID_POSTFIX)) {
      done(`Client ${targetClientId} is not connected to server`);
    } else {
      const publishMessage = [thisUuid, targetClientId, event, args];

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
    const publishMessage = [thisUuid, ackFnName, argArray];

    redisPubClient.publish(EMIT_TO_PERSISTENT_ACK_CHANNEL, JSON.stringify(publishMessage));
  });
}
