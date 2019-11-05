const childProcess = require('child_process');

setTimeout(() => childProcess.fork('./server.js'), 200);
setTimeout(() => childProcess.fork('./target-client.js'), 400);
setTimeout(() => childProcess.fork('./source-client.js'), 600);
