const childProcess = require('child_process');

setTimeout(() => childProcess.fork('./service/server.js'), 200);
setTimeout(() => childProcess.fork('./service/device-client.js'), 400);
setTimeout(() => childProcess.fork('./service/web-client-a.js'), 600);
