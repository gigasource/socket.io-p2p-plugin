const clientId = 'web-client';
const targetService = 'job-service';
const socketClient = require('socket.io-client');
const p2pClientPlugin = require("../../../src/p2p-client-plugin");

const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${clientId}`);
const socket = p2pClientPlugin(rawSocket, clientId);

const jobInfo = {
  jobName: 'downloadFile',
  targetClientId: 'mobile-device',
  jobData: {
    files: ['test.txt', 'image.png'],
  }
};

socket.emitService(targetService, 'create', jobInfo, (topicName) => {
  socket.subscribeTopic(targetService, `${topicName}`, (jobStatus) => console.log(`Job ${topicName} status: ${jobStatus}`));
});
