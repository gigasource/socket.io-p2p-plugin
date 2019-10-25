const sourceClientId = 'client-a';
const p2pClientPlugin = require("../../src/p2p-client-plugin");
const socketClient = require('socket.io-client');
const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const socket = p2pClientPlugin(rawSocket, sourceClientId);

(() => {
  const jobInfo = {
    name: 'downloadFile',
    targetClientId: 'device-1',
    content: {
      files: ['test.txt', 'image.png'],
    }
  };

  socket.emitService('job', 'create', jobInfo, (jobId) => {
    const watchRequestArgs = {
      clientId: socket.clientId,
      jobId
    };

    socket.emitService('job', 'watch', watchRequestArgs, (success) => {
      if (success) {
        socket.on(`job-${jobId}-progress`, (jobStatus) => {
          console.log(`Job ${jobId} status: ${jobStatus}`);
        });
      }
    });
  });
})();
