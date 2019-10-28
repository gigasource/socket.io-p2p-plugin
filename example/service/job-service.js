const sourceClientId = 'job';
const serviceName = 'job';
const p2pClientPlugin = require("../../src/p2p-client-plugin");
const socketClient = require('socket.io-client');
const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}&serviceName=${serviceName}`);
const jobService = p2pClientPlugin(rawSocket, sourceClientId, serviceName);
const _ = require('lodash');
const jobTopic = {};

const files = [
  {
    fileName: 'test.txt',
    size: 15,
  },
  {
    fileName: 'image.png',
    size: 47,
  },
  {
    fileName: 'script.js',
    size: 23,
  }
];


(() => {
  let jobId = 1;

  jobService._topicNameTranslator = function (topicId) {
    return jobTopic[topicId];
  };

  jobService.provideService('create', ({targetClientId, jobName, content} , callback) => {
    const topicName = `job-${jobName}-${jobId}`;
    jobService.emitClient(targetClientId, 'create', {jobId, jobName, content});
    jobService.createTopic(topicName);
    jobTopic[jobId] = topicName;
    callback(jobId++);
    setTimeout(() => {
      console.log('destroy topic');
      jobService.destroyTopic(topicName);
    }, 10000);
  });

  jobService.provideService('update', ({jobId, jobStatus}) => {
    const roomName = jobTopic[jobId];
    if (roomName) {
      jobService.publishTopic(roomName, jobStatus);
      // callback(true);
    } else {
      // callback(false);
    }
  });

  jobService.provideService('getFileInfo', ({fileName}, callback) => {
    const file = _.find(files, {fileName: fileName});
    if (file) callback(file);
    else callback(null);
  });

  jobService.provideService('listJobs', (callback) => {
    callback(Object.keys(jobTopic));
  });
})();
