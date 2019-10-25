const sourceClientId = 'job';
const serviceName = 'job-service';
const p2pClientPlugin = require("../../src/p2p-client-plugin");
const socketClient = require('socket.io-client');
const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}&serviceName=${serviceName}`);
const socket = p2pClientPlugin(rawSocket, sourceClientId);
const _ = require('lodash');
const jobRoom = {};

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

  socket.provideService('create', ({targetClientId, name, content} , callback) => {
    const roomName = `job-${name}-${jobId}`;
    socket.emitTo(targetClientId, name, jobId, content);
    socket.joinTopic(roomName);
    jobRoom[jobId] = roomName;
    callback(jobId++);
  });

  socket.provideService('watch', ({clientId, jobId}, callback) => {
    const roomName = jobRoom[jobId];
    if (roomName) {
      socket.subscribeClient(clientId, roomName, callback);
      callback(true);
    } else {
      callback(false);
    }
  });

  socket.provideService('update', ({jobId, jobStatus}) => {
    const roomName = jobRoom[jobId];
    if (roomName) {
      socket.emitRoom(roomName, `job-${jobId}-progress`, jobStatus);
      // callback(true);
    } else {
      // callback(false);
    }
  });

  socket.provideService('getFileInfo', ({fileName}, callback) => {
    const file = _.find(files, {fileName: fileName});
    if (file) callback(file);
    else callback(null);
  });

  socket.provideService('listJobs', (callback) => {
    callback(Object.keys(jobRoom));
  });
})();
