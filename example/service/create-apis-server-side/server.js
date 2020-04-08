const http = require('http');
const socketIO = require('socket.io');
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

server.provideService('job:create', ({targetClientId, jobName, jobData}, callback) => {
  server.applyWhenConnect(targetClientId, function () {
    const topicName = `${jobName}-${jobId}`;
    const filenames = jobData.files;

    const filesToDownload = files.filter(f => filenames.includes(f.fileName));
    server.emitTo(targetClientId, 'createJob', {jobId, jobName, filesToDownload}, () => console.log('Job-service: job sent !!!')); // emitClient is just another name for emitTo
    server.createTopic(topicName); // topic must be created before service can publish to topic
    topics[jobId] = topicName;
    callback(topicName); // This is important, clients need to know the topicName to subscribe to
    jobId++;
  })
});

server.provideService('job:status-update', ({jobId, jobStatus}) => {
  const topicName = topics[jobId];
  if (topicName) server.publishTopic(topicName, jobStatus); // all clients subscribed to this topicName will receive data
});

server.provideService('job:list', (callback) => {
  callback(Object.values(topics));
});
