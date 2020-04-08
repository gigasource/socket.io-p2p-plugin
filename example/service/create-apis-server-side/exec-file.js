const childProcess = require('child_process');

setTimeout(() => childProcess.fork('./server.js'), 200);
setTimeout(() => childProcess.fork('./device-client.js'), 4000);
setTimeout(() => childProcess.fork('./web-client.js'), 800);
setTimeout(() => childProcess.fork('./web-client-watcher.js'), 4200);
