const sourceClientId = 'web-client-watcher';
const targetService = 'job-service';
const p2pClientPlugin = require("../../../src/p2p-client-plugin");
const socketClient = require('socket.io-client');
const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const socket = p2pClientPlugin(rawSocket, sourceClientId);

socket.emitTo(targetService, 'job:list', (jobList) => {
  jobList.forEach(topicName => {
    socket.subscribeTopic(topicName, jobStatus => console.log(`Web-client-watcher: Job ${topicName} status: ${jobStatus}`));

    setTimeout(() => {
      console.log('watcher unsubscribe');
      socket.unsubscribeTopic(topicName);
    }, 5000);
  });
});
