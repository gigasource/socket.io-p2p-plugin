const p2pServerPlugin = require('../../src/p2p-server-plugin');
const http = require('http');
const socketIO = require('socket.io');
const find = require('lodash/find');
const jobTopic = {};

const httpServer = http.createServer((req, res) => res.end()).listen(9000);

const io = socketIO.listen(httpServer, {
  pingInterval: 1000,
  pingTimeout: 60000,
});

const server = p2pServerPlugin(io, {
  isService: true,
});

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

server.topicNameTranslator = function (topicId) {
  return jobTopic[topicId];
};

server.asService('job').provideService('create', ({targetClientId, jobName, content} , callback) => {
  const topicName = `job-${jobName}-${jobId}`;
  const filesToDownload = [];
  content.files.forEach(fileName => {
    const file = find(files, {fileName: fileName});
    filesToDownload.push(file);
  });

  server.asService('job').emitClient(targetClientId, 'create', {jobId, jobName, filesToDownload});
  server.createTopic(topicName);
  jobTopic[jobId] = topicName;
  callback(jobId++);
});

server.asService('job').provideService('update', ({jobId, jobStatus}) => {
  const roomName = jobTopic[jobId];
  if (roomName) {
    server.publishTopic(roomName, jobStatus);
    // callback(true);
  } else {
    // callback(false);
  }
});
