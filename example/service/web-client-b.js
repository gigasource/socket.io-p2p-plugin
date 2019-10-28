const sourceClientId = 'client-b';
const p2pClientPlugin = require("../../src/p2p-client-plugin");
const socketClient = require('socket.io-client');
const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const socket = p2pClientPlugin(rawSocket, sourceClientId);

(() => {
  socket.emitService('job', 'listJobs', (jobList) => {
    jobList.forEach(jobId => {
      socket.subscribeTopic('job', jobId, (jobStatus) => {
        console.log(`Job ${jobId} status: ${jobStatus}`);
      });

      setTimeout(() => {
        console.log('unsubscribe');
        socket.unsubscribeTopic('job', jobId);
      }, 5000);
    });
  });
})();
