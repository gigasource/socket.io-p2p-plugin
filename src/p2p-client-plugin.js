const P2pCoreApi = require('./api/client/core');
const P2pMessageApi = require('./api/client/message');
const P2pStreamApi = require('./api/client/stream');
const P2pServiceApi = require('./api/client/service');

module.exports = function p2pClientPlugin(socket, clientId, options) {
  const p2pClientCoreApi = new P2pCoreApi(socket, clientId);
  const p2pClientMessageApi = new P2pMessageApi(socket, clientId);
  const p2pClientStreamApi = new P2pStreamApi(socket, p2pClientMessageApi);
  const p2pServiceApi = new P2pServiceApi(socket, p2pClientMessageApi);

  return new Proxy(socket, {
    get(obj, prop) {

      if (prop === 'clientId') return clientId;

      if (prop === 'joinRoom') return p2pClientCoreApi.joinRoom.bind(p2pClientCoreApi);
      if (prop === 'leaveRoom') return p2pClientCoreApi.leaveRoom.bind(p2pClientCoreApi);
      if (prop === 'emitRoom') return p2pClientCoreApi.emitRoom.bind(p2pClientCoreApi);
      if (prop === 'createTopic') return p2pClientCoreApi.createTopic.bind(p2pClientCoreApi);
      if (prop === 'destroyTopic') return p2pClientCoreApi.destroyTopic.bind(p2pClientCoreApi);
      if (prop === 'publishTopic') return p2pClientCoreApi.publishTopic.bind(p2pClientCoreApi);
      if (prop === 'subscribeTopic') return p2pClientCoreApi.subscribeTopic.bind(p2pClientCoreApi);
      if (prop === 'unsubscribeTopic') return p2pClientCoreApi.unsubscribeTopic.bind(p2pClientCoreApi);

      if (prop === 'addP2pTarget') return p2pClientMessageApi.addP2pTarget.bind(p2pClientMessageApi);
      if (prop === 'emitTo') return p2pClientMessageApi.emitTo.bind(p2pClientMessageApi);
      if (prop === 'onAddP2pTarget') return p2pClientMessageApi.onAddP2pTarget.bind(p2pClientMessageApi);

      if (prop === 'addP2pStream') return p2pClientStreamApi.addP2pStream.bind(p2pClientStreamApi);
      if (prop === 'onAddP2pStream') return p2pClientStreamApi.onAddP2pStream.bind(p2pClientStreamApi);
      if (prop === 'offAddP2pStream') return p2pClientStreamApi.offAddP2pStream.bind(p2pClientStreamApi);

      if (prop === 'provideService') return p2pServiceApi.provideService.bind(p2pServiceApi);
      if (prop === 'destroyService') return p2pServiceApi.destroyService.bind(p2pServiceApi);
      if (prop === 'destroyAllServices') return p2pServiceApi.destroyAllServices.bind(p2pServiceApi);
      if (prop === 'emitService') return p2pServiceApi.emitService.bind(p2pServiceApi);

      return obj[prop];
    },
  });
};
