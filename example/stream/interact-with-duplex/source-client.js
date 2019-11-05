const clientId = 'source';
const socketClient = require('socket.io-client');
const p2pClientPlugin = require("../../../src/p2p-client-plugin");

const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${clientId}`);
const socket = p2pClientPlugin(rawSocket, clientId);

(async () => {
  /*
  Source clients will create stream ids for both source & target, these ids are used for identifying streams in a clients
  so it is best to create random, unguessable & hard-to-conflict ids (using UUID libraries for example)

  However, doing this may create security risks but currently security is in our roadmap so it will be handled later
  */
  const duplexOptions1 = {
    sourceStreamId: 'source-stream-1', // will be created using uuid/v1 lib if not set
    targetStreamId: 'target-stream-2', // will be created using uuid/v1 lib if not set
  }

  // The returned object is an instance of NodeJS Duplex
  const duplex1 = await socket.addP2pStream('target', {});
  const duplex2 = await socket.addP2pStream('target', {});
  const duplex3 = await socket.addP2pStream('target', {});
  const duplex4 = await socket.addP2pStream('target', {});

  setInterval(() => {
    duplex1.write('Data from source sent through duplex1\n');
    duplex2.write('Data from source sent through duplex2\n');
    duplex3.write('Data from source sent through duplex3\n');
    duplex4.write('Data from source sent through duplex4\n\n');
  }, 1000);
})();
