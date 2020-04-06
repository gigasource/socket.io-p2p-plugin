const P2pServerCoreApi = require('./api/server/core');
const P2pServerMessageApi = require('./api/server/message');
const P2pServerStreamApi = require('./api/server/stream');
const P2pServerServiceApi = require('./api/server/service');

module.exports = function p2pServerPlugin(io, options) {
  const p2pServerCoreApi = new P2pServerCoreApi(io);
  const p2pServerMessageApi = new P2pServerMessageApi(p2pServerCoreApi);
  const p2pServerStreamApi = new P2pServerStreamApi(p2pServerCoreApi);
  const p2pServerServiceApi = new P2pServerServiceApi(p2pServerCoreApi);

  io.on('connect', (socket) => {
    const {clientId} = socket.request._query;

    socket.getSocketByClientId = (targetClientId) => {
      const targetClientSocket = p2pServerCoreApi.getSocketByClientId(targetClientId);

      if (targetClientId === `${clientId}-server-side`) return socket;

      if (!targetClientSocket)
        p2pServerCoreApi.emitError(socket, new Error(`Could not find target client '${targetClientId}' socket`));

      return targetClientSocket;
    }

    p2pServerCoreApi.addClient(clientId, socket.id);

    p2pServerCoreApi.createListeners(io, socket, clientId);
    p2pServerCoreApi.initSocketBasedApis(socket);
    p2pServerMessageApi.createListeners(socket, clientId);
    p2pServerStreamApi.createListeners(socket, clientId);
    p2pServerServiceApi.createListeners(io, socket);
    if (options && options.isService) p2pServerServiceApi.interceptP2pEmit(socket);
    p2pServerCoreApi.ee.emit(`${clientId}@connected`);
  });

  return new Proxy(io, {
    get: (obj, prop) => {
      if (prop === 'getSocketIdByClientId') return p2pServerCoreApi.getSocketIdByClientId.bind(p2pServerCoreApi);
      if (prop === 'getAllClientId') return p2pServerCoreApi.getAllClientId.bind(p2pServerCoreApi);
      if (prop === 'getClientIdBySocketId') return p2pServerCoreApi.getClientIdBySocketId.bind(p2pServerCoreApi);
      if (prop === 'addStreamAsClient') return p2pServerStreamApi.addStreamAsClient.bind(p2pServerStreamApi);
      if (prop === 'applyWhenConnect') return p2pServerCoreApi.applyWhenConnect.bind(p2pServerCoreApi);
      if (prop === '$emit') return p2pServerCoreApi.ee.emit.bind(p2pServerCoreApi.ee);
      if (prop === '$on') return p2pServerCoreApi.ee.on.bind(p2pServerCoreApi.ee);

      if (options && options.isService) {
        if (prop === 'asService') return p2pServerServiceApi.asService.bind(p2pServerServiceApi);
        if (prop === 'destroyAllServices') return p2pServerServiceApi.destroyAllServices.bind(p2pServerServiceApi);
        if (prop === 'createdTopics') return p2pServerServiceApi.createdTopics;
        if (prop === 'serviceApis') return p2pServerServiceApi.serviceApis;
      }

      return obj[prop];
    },
  });
};
