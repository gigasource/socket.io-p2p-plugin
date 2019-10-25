const P2pCoreApi = require('./api/core');
const P2pMessageApi = require('./api/message/single');
const P2pStreamApi = require('./api/stream/single');
const P2pMultiMessageApi = require('./api/message/multi');
const P2pMultiStreamApi = require('./api/stream/multi');
const P2pServiceApi = require('./api/service/');

module.exports = function p2pClientPlugin(socket, clientId) {
  const p2pCoreApi = new P2pCoreApi(socket);
  const p2pMessageApi = new P2pMessageApi(socket, clientId); // allow 1-1 connections
  const p2pStreamApi = new P2pStreamApi(socket, p2pMessageApi); // allow 1-1 connections
  const p2pMultiMessageApi = new P2pMultiMessageApi(socket, clientId) // allow n-n connections
  const p2pMultiStreamApi = new P2pMultiStreamApi(socket, p2pMultiMessageApi) // allow n-n connections
  const p2pServiceApi = new P2pServiceApi(socket, p2pMultiMessageApi);

  return new Proxy(socket, {
    get: (obj, prop) => {

      if (prop === 'joinRoom') return p2pCoreApi.joinRoom.bind(p2pServiceApi);
      if (prop === 'emitRoom') return p2pCoreApi.emitRoom.bind(p2pServiceApi);

      if (prop === 'registerP2pTarget') return p2pMessageApi.registerP2pTarget.bind(p2pMessageApi);
      if (prop === 'unregisterP2pTarget') return p2pMessageApi.unregisterP2pTarget.bind(p2pMessageApi);
      if (prop === 'emit2' || prop === 'emitP2p') return p2pMessageApi.emit2.bind(p2pMessageApi);
      if (prop === 'getClientList') return p2pMessageApi.getClientList.bind(p2pMessageApi);
      if (prop === 'targetClientId') return p2pMessageApi.targetClientId;
      if (prop === 'clientId') return p2pMessageApi.clientId || p2pMultiMessageApi.clientId;

      if (prop === 'registerP2pStream') return p2pStreamApi.registerP2pStream.bind(p2pStreamApi);
      if (prop === 'onRegisterP2pStream') return p2pStreamApi.onRegisterP2pStream.bind(p2pStreamApi);
      if (prop === 'offRegisterP2pStream') return p2pStreamApi.offRegisterP2pStream.bind(p2pStreamApi);

      if (prop === 'addP2pTarget') return p2pMultiMessageApi.addP2pTarget.bind(p2pMultiMessageApi);
      if (prop === 'emitTo') return p2pMultiMessageApi.emitTo.bind(p2pMultiMessageApi);
      if (prop === 'from') return p2pMultiMessageApi.from.bind(p2pMultiMessageApi);
      if (prop === 'onAddP2pTarget') return p2pMultiMessageApi.onAddP2pTarget.bind(p2pMultiMessageApi);
      if (prop === 'onAny') return p2pMultiMessageApi.onAny.bind(p2pMultiMessageApi);

      if (prop === 'addP2pStream') return p2pMultiStreamApi.addP2pStream.bind(p2pMultiStreamApi);
      if (prop === 'onAddP2pStream') return p2pMultiStreamApi.onAddP2pStream.bind(p2pMultiStreamApi);
      if (prop === 'offAddP2pStream') return p2pMultiStreamApi.offAddP2pStream.bind(p2pMultiStreamApi);
      if (prop === 'fromStream') return p2pMultiStreamApi.fromStream.bind(p2pMultiStreamApi);
      if (prop === 'offStreamListeners') return p2pMultiStreamApi.offStreamListeners.bind(p2pMultiStreamApi);

      if (prop === 'emitService') return p2pServiceApi.emitService.bind(p2pServiceApi);
      if (prop === 'provideService') return p2pServiceApi.provideService.bind(p2pServiceApi);
      if (prop === 'onService') return p2pServiceApi.onService.bind(p2pServiceApi);
      if (prop === 'publishService') return p2pServiceApi.publishService.bind(p2pServiceApi);
      if (prop === 'subscribeClient') return p2pServiceApi.subscribeClient.bind(p2pServiceApi);

      return obj[prop];
    }
  });
};
