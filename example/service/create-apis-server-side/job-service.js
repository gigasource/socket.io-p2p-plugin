const sourceClientId = 'job-service';
const p2pClientPlugin = require("../../../src/p2p-client-plugin");
const socketClient = require('socket.io-client');

const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const jobService = p2pClientPlugin(rawSocket, sourceClientId, {isService: true}); // {isService: true} is required

// If server can't handle the API request, the request will be forwarded to correct client
// However, in this case, server can handle the request so this the log won't be printed
jobService.provideService('create', ({targetClientId, jobName, jobData}, callback) => console.log('This should not be logged'));
