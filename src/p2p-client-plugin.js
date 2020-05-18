const P2pCoreApi = require('./api/client/core');
const P2pMessageApi = require('./api/client/message');
const P2pStreamApi = require('./api/client/stream');
const P2pServiceApi = require('./api/client/service');

module.exports = function p2pClientPlugin(socket, clientId, options) {
  const p2pClientCoreApi = new P2pCoreApi(socket, clientId);
  const p2pClientMessageApi = new P2pMessageApi(socket, clientId);
  const p2pClientStreamApi = new P2pStreamApi(socket, p2pClientMessageApi);
  const p2pServiceApi = new P2pServiceApi(socket);

  return Object.assign(socket, {
    clientId,
    joinRoom: p2pClientCoreApi.joinRoom.bind(p2pClientCoreApi),
    leaveRoom: p2pClientCoreApi.leaveRoom.bind(p2pClientCoreApi),
    emitRoom: p2pClientCoreApi.emitRoom.bind(p2pClientCoreApi),

    addP2pTarget: p2pClientMessageApi.addP2pTarget.bind(p2pClientMessageApi),
    emitTo: p2pClientMessageApi.emitTo.bind(p2pClientMessageApi),
    onAddP2pTarget: p2pClientMessageApi.onAddP2pTarget.bind(p2pClientMessageApi),
    onP2pTargetDisconnect: p2pClientMessageApi.onP2pTargetDisconnect.bind(p2pClientMessageApi),

    addP2pStream: p2pClientStreamApi.addP2pStream.bind(p2pClientStreamApi),
    onAddP2pStream: p2pClientStreamApi.onAddP2pStream.bind(p2pClientStreamApi),
    offAddP2pStream: p2pClientStreamApi.offAddP2pStream.bind(p2pClientStreamApi),

    provideService: p2pServiceApi.provideService.bind(p2pServiceApi),
    destroyService: p2pServiceApi.destroyService.bind(p2pServiceApi),
    destroyAllServices: p2pServiceApi.destroyAllServices.bind(p2pServiceApi),
    emitService: p2pServiceApi.emitService.bind(p2pServiceApi),
  });
};
