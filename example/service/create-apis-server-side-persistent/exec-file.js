const childProcess1 = require('child_process');
const childProcess2 = require('child_process');

let process1;
setTimeout(() => {
  console.log('start server 1st time');
  process1 = childProcess1.fork('./server.js');
}, 500);
setTimeout(() => {
  console.log('start web client');
  childProcess2.fork('./web-client.js');
}, 2000);
// setTimeout(() => {
//   console.log('kill server');
//   process1.kill();
// }, 1500);
// setTimeout(() => {
//   console.log('start server 2nd time');
//   childProcess2.fork('./server.js');
// }, 2000);
setTimeout(() => {
  console.log('start device 1');
  childProcess2.fork('./device-client1.js');
}, 1000);
setTimeout(() => {
  console.log('start device 2');
  childProcess2.fork('./device-client2.js');
}, 5000);
// setTimeout(() => childProcess2.fork('./server.js'), 2500);
// setTimeout(() => childProcess.fork('./device-client.js'), 1000);
// setTimeout(() => childProcess.fork('./web-client-watcher.js'), 2000);
