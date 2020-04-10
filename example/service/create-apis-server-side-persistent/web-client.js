const clientId = 'web-client';
const socketClient = require('socket.io-client');
const p2pClientPlugin = require("../../../src/p2p-client-plugin");

const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${clientId}`);
const socket = p2pClientPlugin(rawSocket, clientId);

const jobInfo1 = {
  jobName: 'downloadFile',
  targetClientId: 'mobile-device1',
  jobData: {
    files: ['test.txt', 'image.png'],
  }
};

const jobInfo2 = {
  jobName: 'downloadFile',
  targetClientId: 'mobile-device2',
  jobData: {
    files: ['test.txt', 'image.png'],
  }
};

socket.emitService('job:create', jobInfo1,
    /*        topicName => {
      socket.subscribeTopic(topicName, jobStatus => console.log(`Webclient: Job ${topicName} status: ${jobStatus}`));
    }*/
);

socket.emitService('job:create', jobInfo2);
