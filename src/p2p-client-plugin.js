const P2pMessageApi = require('./api/message');
const P2pStreamApi = require('./api/stream');

module.exports = function p2pClientPlugin(socket, clientId) {
  const p2pMessageApi = new P2pMessageApi(socket, clientId);
  const p2pStreamApi = new P2pStreamApi(socket, p2pMessageApi);

  return new Proxy(socket, {
    get: (obj, prop) => {

      if (prop === 'registerP2pTarget') return p2pMessageApi.registerP2pTarget.bind(p2pMessageApi);
      if (prop === 'unregisterP2pTarget') return p2pMessageApi.unregisterP2pTarget.bind(p2pMessageApi);
      if (prop === 'emit2' || prop === 'emitP2p') return p2pMessageApi.emit2.bind(p2pMessageApi);
      if (prop === 'getClientList') return p2pMessageApi.getClientList.bind(p2pMessageApi);
      if (prop === 'targetClientId') return p2pMessageApi.targetClientId;
      if (prop === 'clientId') return p2pMessageApi.clientId;

      if (prop === 'registerP2pStream') return p2pStreamApi.registerP2pStream.bind(p2pStreamApi);
      if (prop === 'onRegisterP2pStream') return p2pStreamApi.onRegisterP2pStream.bind(p2pStreamApi);
      if (prop === 'offRegisterP2pStream') return p2pStreamApi.offRegisterP2pStream.bind(p2pStreamApi);

      return obj[prop];
    }
  });
};
