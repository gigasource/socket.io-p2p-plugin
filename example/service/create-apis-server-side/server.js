const http = require('http');
const socketIO = require('socket.io');
const jobService = 'job-service';
const p2pServerPlugin = require('../../../src/p2p-server-plugin');

const httpServer = http.createServer((req, res) => res.end()).listen(9000);
const io = socketIO.listen(httpServer, {});

const server = p2pServerPlugin(io, {
  isService: true, // this is required if server is used as services
});

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

// Usage to similar to client side
// asService() is required since 1 instance of server can be multiple services
server.asService(jobService).provideService('create', ({targetClientId, jobName, jobData}, callback) => {
  const topicName = `${jobName}-${jobId}`;
  const filenames = jobData.files;

  const filesToDownload = files.filter(f => filenames.includes(f.fileName));
  server.asService(jobService).emitClient(targetClientId, 'create', {jobId, jobName, filesToDownload}); // emitClient is just another name for emitTo
  server.asService(jobService).createTopic(topicName); // topic must be created before service can publish to topic
  topics[jobId] = topicName;
  callback(topicName); // This is important, clients need to know the topicName to subscribe to
  jobId++;
});

server.asService(jobService).provideService('update', ({jobId, jobStatus}) => {
  const topicName = topics[jobId];
  if (topicName) server.asService(jobService).publishTopic(topicName, jobStatus); // all clients subscribed to this topicName will receive data
});

server.asService(jobService).provideService('listJobs', (callback) => {
  callback(Object.values(topics));
});
