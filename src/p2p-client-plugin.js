const P2pMessageApi = require('./api/client/message-single');
const P2pStreamApi = require('./api/client/stream-single');
const P2pMultiMessageApi = require('./api/client/message-multi');
const P2pMultiStreamApi = require('./api/client/stream-multi');

module.exports = function p2pClientPlugin(socket, clientId) {
  const p2pMessageApi = new P2pMessageApi(socket, clientId); // allow 1-1 connections
  const p2pStreamApi = new P2pStreamApi(socket, p2pMessageApi); // allow 1-1 connections
  const p2pMultiMessageApi = new P2pMultiMessageApi(socket, clientId) // allow n-n connections
  const p2pMultiStreamApi = new P2pMultiStreamApi(socket, p2pMultiMessageApi) // allow n-n connections

  return new Proxy(socket, {
    get: (obj, prop) => {

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

      if (prop === 'addP2pStream') return p2pMultiStreamApi.addP2pStream.bind(p2pMultiStreamApi);
      if (prop === 'onAddP2pStream') return p2pMultiStreamApi.onAddP2pStream.bind(p2pMultiStreamApi);
      if (prop === 'offAddP2pStream') return p2pMultiStreamApi.offAddP2pStream.bind(p2pMultiStreamApi);

      return obj[prop];
    }
  });
};
