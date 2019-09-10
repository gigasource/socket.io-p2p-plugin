# socket.io-p2p-plugin

This library consists of 2 components:
  - P2P Server Plugin (src/p2pServerPlugin.js): plugin for [socket.io](https://www.npmjs.com/package/socket.io) lib
  - P2P Client Plugin (src/p2pClientPlugin.js): plugin for [socket.io-client](https://www.npmjs.com/package/socket.io-client) lib

## 1. P2P Server Plugin
This component adds a **P2pServerManager** on top of [socket.io](https://www.npmjs.com/package/socket.io). The manager handles the lifecycle of devices connected to the server and get corresponding socketId of each device.

Some notable custom events included in the component:
- **P2P_REGISTER**: Event for registration between 2 client devices, used for pairing (creating connection between 2 client devices)
- **P2P_REGISTER_SUCCESS**: Event for notifying connection between 2 client devices has been established successfully
- **P2P_REGISTER_FAILED**: Event for notifying connection failure between 2 client devices
- **P2P_DISCONNECT**: Event for notifying that 1 of the 2 pairing devices has disconnected, therefore connection should be terminated and both devices should be freed
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
- Registering client device with the server
- Storing target deviceId for pairing connection
- Registering/unregistering pairing connection between 2 client devices
- Communicating with Socket.IO server with above plugin using **P2P_EMIT** and **P2P_EMIT_ACKNOWLEDGE** events

The plugin is implemented using Javascript's Proxy. New functions are created based on existing functions of [socket.io-client](https://www.npmjs.com/package/socket.io-client)  and they utilize custom events defined in **src/util/constants.js** to communicate with the server.
Refer to file **test/client-testA.js** and **test/client-testB.js** for examples of usage (B should be started first after the server is created, then A will initialize a connection to B when started).

Code examples:

Create & register a device with the server
```$xslt
const sourceDeviceId = 'B';
const p2pClientPlugin = require("../src/p2pClientPlugin");
const socketClient = require('socket.io-client');
const ioRaw = socketClient.connect(`http://localhost:9000?deviceId=${sourceDeviceId}`);
const io = p2pClientPlugin(ioRaw);

io.on('testAck', function () { // Listen to 'testAck' event from a peer device
  io.emit2('testAckFromTarget', {abc: 'test'}); // Emit 'testAckFromTarget' event to peer device
});
```

Attempt to establish a p2p connection
```$xslt
const sourceDeviceId = 'A';
const p2pClientPlugin = require("../src/p2pClientPlugin");
const socketClient = require('socket.io-client');
const ioRaw = socketClient.connect(`http://localhost:9000?deviceId=${sourceDeviceId}`);
const io = p2pClientPlugin(ioRaw);

try {
  io.registerP2pTarget('B', {}, () => {
    io.emit2('testAck', {a: 1}, 'b', 2, {c: 3}, function (result) {
      console.log(result);
    });

    setTimeout(() => {
      io.unregisterP2pTarget(); // Unregister the device with the server, terminate connection & free both peers
    }, 5000);
  });
} catch (e) {
  // handle error if connection can't be made (device is busy, device is offline, ...)
  console.error(e);
}

io.on('testAckFromTarget', function () { // Listen to 'testAckFromTarget' event from a peer device
  console.log(arguments);
});
```

## Roadmap

- Control center: List all/available devices
- Security
- Test
