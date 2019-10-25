const childProcess = require('child_process');

const serverFile = childProcess.execFileSync('node', ['server-test1.js'], {});
const jobServiceFile = childProcess.execFileSync('node', ['./service/job-service.js'], {});
const deviceClientFile = childProcess.execFileSync('node', ['./service/device-client.js'], {});
const webClientFile = childProcess.execFileSync('node', ['./service/web-client.js'], {});
