const sourceClientId = 'job-service';
const p2pClientPlugin = require("../../../src/p2p-client-plugin");
const socketClient = require('socket.io-client');

const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const jobService = p2pClientPlugin(rawSocket, sourceClientId, {isService: true}); // {isService: true} is required
const topics = {};

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

let jobId = 1;

jobService.provideService('job:create', ({targetClientId, jobName, jobData}, callback) => {
  const topicName = `${jobName}-${jobId}`;
  const filenames = jobData.files;

  const filesToDownload = files.filter(f => filenames.includes(f.fileName));
  jobService.emitTo(targetClientId, 'createJob', {jobId, jobName, filesToDownload}); // emitClient is just another name for emitTo
  jobService.createTopic(topicName); // topic must be created before service can publish to topic
  topics[jobId] = topicName;
  callback(topicName); // This is important, clients need to know the topicName to subscribe to
  jobId++;
});

jobService.provideService('job:status-update', ({jobId, jobStatus}) => {
  const topicName = topics[jobId];
  if (topicName) jobService.publishTopic(topicName, jobStatus); // all clients subscribed to this topicName will receive data
});

jobService.provideService('job:list', (callback) => {
  callback(Object.values(topics));
});
