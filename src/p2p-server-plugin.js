const P2pServerCoreApi = require('./api/server/core');
const P2pServerMessageApi = require('./api/server/message');
const P2pServerStreamApi = require('./api/server/stream');
const P2pServerServiceApi = require('./api/server/service');
const {SOCKET_EVENT: {SERVER_ERROR, SERVER_PING}} = require('./util/constants');
const Kareem = require('kareem');

module.exports = function p2pServerPlugin(io, options = {}) {
  io.kareem = new Kareem();
  const {clientOverwrite = false} = options;
  const p2pServerCoreApi = new P2pServerCoreApi(io, options);
  const p2pServerMessageApi = new P2pServerMessageApi(p2pServerCoreApi);
  const p2pServerStreamApi = new P2pServerStreamApi(p2pServerCoreApi);
  const p2pServerServiceApi = new P2pServerServiceApi();

  io.on('connect', socket => {
    const {clientId} = socket.request._query;

    if (!clientId) return;

    const existingSocket = p2pServerCoreApi.getSocketByClientId(clientId);

    if (existingSocket) {
      const errorMessage = `p2p Socket.io lib: Duplicated clientId ${clientId} on connect, new socket id = ${socket.id}`;

      p2pServerCoreApi.emitLibLog(errorMessage, {clientId, socketId: socket.id});

      existingSocket.once('disconnect', () => {
        const msg = `p2p Socket.io lib: Duplicated clientId ${clientId} on connect, old socket disconnected, id = ${existingSocket.id}`;
        p2pServerCoreApi.emitLibLog(msg, {clientId, socketId: existingSocket.id});
      });

      if (!clientOverwrite) {
        socket.emit(SERVER_ERROR, errorMessage + ', new socket with duplicated clientId will be disconnected');
        return socket.disconnect();
      }

      socket.emit(SERVER_PING, msg => p2pServerCoreApi.emitLibLog(`New socket with id ${socket.id}: ${msg}`, {
        clientId,
        socketId: socket.id
      }));
      existingSocket.emit(SERVER_PING, msg => p2pServerCoreApi.emitLibLog(`Old socket with id ${existingSocket.id}: ${msg}`, {
        clientId,
        socketId: existingSocket.id
      }));
    }

    socket.clientId = clientId;
    socket.createdTime = new Date();

    p2pServerCoreApi.sendSavedMessages(clientId);

    p2pServerCoreApi.createListeners(io, socket, clientId);
    p2pServerCoreApi.initSocketBasedApis(socket);
    p2pServerMessageApi.createListeners(socket, clientId);
    p2pServerStreamApi.createListeners(socket, clientId);
    p2pServerServiceApi.createListeners(io, socket);
  });

  const serverPlugin = Object.assign(io, {
    getSocketIdByClientId: p2pServerCoreApi.getSocketIdByClientId.bind(p2pServerCoreApi),
    getSocketByClientId: p2pServerCoreApi.getSocketByClientId.bind(p2pServerCoreApi),
    getAllClientId: p2pServerCoreApi.getAllClientId.bind(p2pServerCoreApi),
    getClientIdBySocketId: p2pServerCoreApi.getClientIdBySocketId.bind(p2pServerCoreApi),
    addStreamAsClient: p2pServerStreamApi.addStreamAsClient.bind(p2pServerStreamApi),

    sendSavedMessages: p2pServerCoreApi.sendSavedMessages.bind(p2pServerCoreApi),
    emitTo: p2pServerCoreApi.emitTo.bind(p2pServerCoreApi),
    emitToPersistent: p2pServerCoreApi.emitToPersistent.bind(p2pServerCoreApi),
    registerAckFunction: p2pServerCoreApi.registerAckFunction.bind(p2pServerCoreApi),
    unregisterAckFunction: p2pServerCoreApi.unregisterAckFunction.bind(p2pServerCoreApi),
    ackFunctions: p2pServerCoreApi.ackFunctions,
    virtualClients: p2pServerCoreApi.virtualClients,
    $emit: p2pServerCoreApi.ee.emit.bind(p2pServerCoreApi.ee),
    $on: p2pServerCoreApi.ee.on.bind(p2pServerCoreApi.ee),
    $off: p2pServerCoreApi.ee.off.bind(p2pServerCoreApi.ee),
    $once: p2pServerCoreApi.ee.once.bind(p2pServerCoreApi.ee),
    // used for extending library logs
    onLibLog: p2pServerCoreApi.onLibLog.bind(p2pServerCoreApi),
    emitLibLog: p2pServerCoreApi.emitLibLog.bind(p2pServerCoreApi),

    provideService: p2pServerServiceApi.provideService.bind(p2pServerServiceApi),
    destroyService: p2pServerServiceApi.destroyService.bind(p2pServerServiceApi),
    destroyAllServices: p2pServerServiceApi.destroyAllServices.bind(p2pServerServiceApi),
    serviceApis: p2pServerServiceApi.serviceApis,
  });

  if (io._adapter.name.toLowerCase() === 'redis') require('./api/server/adapter/redis')(io, serverPlugin);

  return serverPlugin;
};
