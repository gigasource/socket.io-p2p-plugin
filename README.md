# socket.io-p2p-plugin

This library consists of 2 components:
  - P2P Server Plugin (src/p2pServerPlugin.js): plugin for [socket.io](https://www.npmjs.com/package/socket.io) lib
  - P2P Client Plugin (src/p2pClientPlugin.js): plugin for [socket.io-client](https://www.npmjs.com/package/socket.io-client) lib

## 1. P2P Server Plugin
This component adds a **P2pServerManager** on top of [socket.io](https://www.npmjs.com/package/socket.io). The manager handles the lifecycle of clients connected to the server and get corresponding socketId of each client.

Some notable custom events included in the component:
- **P2P_REGISTER**: Event for registration between 2 clients, used for pairing (creating connection between 2 clients)
- **P2P_REGISTER_SUCCESS**: Event for notifying connection between 2 clients has been established successfully
- **P2P_REGISTER_FAILED**: Event for notifying connection failure between 2 clients
- **P2P_DISCONNECT**: Event for notifying that 1 of the 2 pairing clients has disconnected, therefore connection should be terminated and both clients should be freed
- **P2P_EMIT**: Event used in emit2 function in client plugin - **without** acknowledgement from server side
- **P2P_EMIT_ACKNOWLEDGE**: Event used in emit2 function in client plugin - **with** acknowledgement from server side

The server must be started before client plugin can be used and before clients can connect to the server.
Refer to file **test/server-test1.js** for example of usage.

Code examples:

Start server
```$xslt
const p2pServerPlugin = require('../src/p2pServerPlugin');
const http = require('http');
const socketIO = require('socket.io');

const server = http.createServer((req, res) => res.end()).listen(9000);
const io = socketIO.listen(server);
p2pServerPlugin(io); //start the server & init essential socket events
```

## 2. P2P Client Plugin
This component adds some custom functions on top of [socket.io-client](https://www.npmjs.com/package/socket.io-client) for:
- Registering client with the server
- Storing target clientId for pairing connection
- Registering/unregistering pairing connection between 2 clients
- Communicating with Socket.IO server with above plugin using **P2P_EMIT** and **P2P_EMIT_ACKNOWLEDGE** events

The plugin is implemented using Javascript's Proxy. New functions are created based on existing functions of [socket.io-client](https://www.npmjs.com/package/socket.io-client)  and they utilize custom events defined in **src/util/constants.js** to communicate with the server.
Refer to file **test/client-testA.js** and **test/client-testB.js** for examples of usage (B should be started first after the server is created, then A will initialize a connection to B when started).

Code examples:

Create & register a client with the server
```$xslt
const sourceClientId = 'B';
const p2pClientPlugin = require("../src/p2pClientPlugin");
const socketClient = require('socket.io-client');
const ioRaw = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const io = p2pClientPlugin(ioRaw);

io.on('testAck', function () { // Listen to 'testAck' event from a peer client
  io.emit2('testAckFromTarget', {abc: 'test'}); // Emit 'testAckFromTarget' event to peer client
});
```

Attempt to establish a p2p connection
```$xslt
const sourceClientId = 'A';
const p2pClientPlugin = require("../src/p2pClientPlugin");
const socketClient = require('socket.io-client');
const ioRaw = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const io = p2pClientPlugin(ioRaw);

try {
  io.registerP2pTarget('B', {}, () => {
    io.emit2('testAck', {a: 1}, 'b', 2, {c: 3}, function (result) {
      console.log(result);
    });

    setTimeout(() => {
      io.unregisterP2pTarget(); // Unregister the client with the server, terminate connection & free both peers
    }, 5000);
  });
} catch (e) {
  // handle error if connection can't be made (client is busy, client is offline, ...)
  console.error(e);
}

io.on('testAckFromTarget', function () { // Listen to 'testAckFromTarget' event from a peer client
  console.log(arguments);
});
```

## Roadmap

- Control center: List all/available clients
- Security
- Test
- Handle duplicated clientId/wrong param format
