const http = require('http');
const socketIO = require('socket.io');
const p2pServerPlugin = require('../../../src/p2p-server-plugin');

const httpServer = http.createServer((req, res) => res.end()).listen(9000);
const io = socketIO.listen(httpServer, {});

const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync('job.json');
const db = low(adapter);
db.defaults({savedMessages: {}}).write();
const uuidv1 = require('uuid/v1');

function saveToDb(targetClientId, value) {
  db.set(`savedMessages.${targetClientId}`, value).write();
}

function loadFromDb(targetClientId) {
  return db.read().get(`savedMessages.${targetClientId}`).value() || [];
}

function saveMessage(targetClientId, message) {
  message._id = uuidv1();

  const savedMessages = loadFromDb(targetClientId);
  savedMessages.push(message);

  saveToDb(targetClientId, savedMessages);
  return message._id;
}

function deleteMessage(targetClientId, _id) {
  let savedMessages = loadFromDb(targetClientId);
  saveToDb(targetClientId, savedMessages.filter(msg => msg._id !== _id));
}

function loadMessages(targetClientId) {
  return loadFromDb(targetClientId);
}

const server = p2pServerPlugin(io, {
  saveMessage, loadMessages, deleteMessage,
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

let currentJobId = 1;

server.registerAckFunction('createJobAck', (jobId, topicName) => {
  console.log('Job-service: job sent !!!');
  server.createTopic(topicName); // topic must be created before service can publish to topic
  topics[jobId] = topicName;
})

server.provideService('job:create', async ({targetClientId, jobName, jobData}) => {
  const jobId = currentJobId++;
  const topicName = `${jobName}-${jobId}`;
  const filenames = jobData.files;

  const filesToDownload = files.filter(f => filenames.includes(f.fileName));
  const emitData = {
    jobId,
    jobName,
    filesToDownload
  };

  server.emitToPersistent(targetClientId, 'createJob', [emitData], 'createJobAck', [jobId, topicName]);
});

/*
server.provideService('job:status-update', ({jobId, jobStatus}) => {
  const topicName = topics[jobId];
  if (topicName) server.publishTopic(topicName, jobStatus); // all clients subscribed to this topicName will receive data
});

server.provideService('job:list', (callback) => {
  callback(Object.values(topics));
});
*/
