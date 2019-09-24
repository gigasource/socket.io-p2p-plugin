# socket.io-p2p-plugin

This library consists of 2 components:
  - P2P Server Plugin (src/p2p-server-plugin.js): plugin for [socket.io](https://www.npmjs.com/package/socket.io) lib
  - P2P Client Plugin (src/p2p-client-plugin.js): plugin for [socket.io-client](https://www.npmjs.com/package/socket.io-client) lib

## 1. Feature list
### 1.1. Server
- Accept connections from clients
- Storing clients with the structure {**clientId**: **socketId of client**}
- Handle P2P registration and handle unregister/disconnect event after registration is successful
- Forward **P2P_EMIT** & **P2P_EMIT_ACKNOWLEDGE** to simulate P2P connections
- After clients register successfully, they can request for extra features such as Stream API
- Expose Server APIs through Socket.IO events, currently there is only **LIST_CLIENTS**
### 1.2. Client
#### 1.2.1. Message API
- Register/unregister peer
- Send data to peer using **emit2** function
- Call server APIs using Socket.IO events
#### 1.2.2. Stream API
- Listen to **P2P_REGISTER_STREAM** event to create stream connection, a stream will be created when this event is fired
(a new stream is created every time this event is fired, refer to the example below for more details)
- Request for stream connection by emitting **P2P_REGISTER_STREAM**, a stream will be created if peer is listening to this event, 
null will be returned otherwise
- The returned stream is a NodeJS Duplex

## 2. P2P Server Plugin
This component adds a **P2pServerManager** on top of [socket.io](https://www.npmjs.com/package/socket.io). The manager handles the lifecycle of clients connected to the server and get corresponding socketId of each client.

Custom events included in the component (can be found in /src/util/constants.js):
- **P2P_REGISTER**: Event for registration between 2 clients, used for pairing (creating connection between 2 clients)
- **P2P_UNREGISTER**: Event for unregistering, both ends of a connection can fire this event to terminate the p2p connection and they will be available for other clients to connect to after unregistering
- **P2P_DISCONNECT**: Event for notifying that 1 of the 2 pairing clients has disconnected, therefore connection should be terminated and both clients should be freed
- **P2P_EMIT**: Event used in emit2 function in client plugin - **without** acknowledgement from server side
- **P2P_EMIT_ACKNOWLEDGE**: Event used in emit2 function in client plugin - **with** acknowledgement from server side
- **LIST_CLIENTS**: Event used for client's request for current list of connected client on the server
- **SERVER_ERROR**: When an error is caught on the server, it will be caught and emitted to clients to notify them about the error
- **P2P_REGISTER_STREAM**: Event used for requesting a stream-like connection between 2 peers, a Duplex stream will be created on both ends to transfer data
- **P2P_EMIT_STREAM**: Event used for sending data through the established stream created by **P2P_REGISTER_STREAM** event

The server must be started before client plugin can be used and before clients can connect to the server.
Refer to file **/src/example/server-test1.js** for example of usage.

Code examples:

Start server
```$xslt
const p2pServerPlugin = require('../p2p-server-plugin');
const http = require('http');
const socketIO = require('socket.io');

const httpServer = http.createServer((req, res) => res.end()).listen(9000);
const io = socketIO.listen(httpServer);
const server = p2pServerPlugin(io);
```

## 3. P2P Client Plugin
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
const p2pClientPlugin = require("../p2p-client-plugin");
const socketClient = require('socket.io-client');
const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const io = p2pClientPlugin(rawSocket);

io.on('testAck', (arg1, arg2, arg3, arg4, ackFn) => {
  console.log(arg1);
  ackFn(arg1);
});
```

Attempt to establish a p2p connection
```$xslt
const sourceClientId = 'A';
const p2pClientPlugin = require("../p2p-client-plugin");
const socketClient = require('socket.io-client');
const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const socket = p2pClientPlugin(rawSocket);

const test = async () => {
  const connectionSuccess = await socket.registerP2pTarget('B', {});

  if (connectionSuccess) {
    socket.emit2('testNoAck', {a: 'testNoAck'}, 'b', 2, {c: 3}); // No Ack

    socket.emit2('testAck', {a: 'testAck'}, 'b', 2, {c: 3}, function (result) { // With Ack
      console.log(typeof result);
    });

    setTimeout(() => {
      socket.unregisterP2pTarget(() => {
        console.log('unregister');
      });
    }, 3000);
  } else {
    // Failed connection -> client can add logic to handle here
    console.log('failed');
  }
}

test();
```

### 3.1. Client plugin APIs
#### 3.1.1. Message API
Since the library is constructed based on Socket.IO, sending message-based events is its core functionality, this Message API deals with
connecting/disconnecting & registering/unregistering clients to the server, sending messages between 2 peers after they're connected and registered.\
These features are for simulating P2P connection between 2 clients so developers don't have to deal with server logic too much\
In the future, APIs can be added using Message API (API is called and transfers data using Socket.IO events). Currently there is 1 API: **LIST_CLIENT**
### 3.1.2. Stream API
This API adds stream functionality to the library.
NodeJS Duplex stream is used on both ends to send and receive data and they can be used like normal NodeJS Duplex stream\
Examples (found in /src/example/stream/):

Consumer/Receiver:
```$xslt
const sourceClientId = 'B';
const p2pClientPlugin = require("../../p2p-client-plugin");
const socketClient = require('socket.io-client');
const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const socket = p2pClientPlugin(rawSocket);

socket.onRegisterP2pStream({}, duplex => {
  // listen for an event from its peer, stream will be created when the event is received on this end
  duplex.pipe(process.stdout); 
});

// If user wants to disconnect, it is required to call socket.offRegisterP2pStream to prevent new Duplex from being created
```

Producer/Sender:
```$xslt
const sourceClientId = 'A';
const p2pClientPlugin = require("../../p2p-client-plugin");
const socketClient = require('socket.io-client');
const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const socket = p2pClientPlugin(rawSocket);

async function test() {
  const connectionSuccess = await socket.registerP2pTarget('B');
  if (!connectionSuccess) return;

  const duplex = await socket.registerP2pStream({}); // Stream will be created after this called, or returns null if peer is not listening to this event
  if (!duplex) return;

  let i = 0;
  let needDrain = false;

  duplex.on('drain', () => needDrain = false); // Users should using 'drain' event in case of writing large, continuous data to avoid using too much memory

  setInterval(() => {
    if (needDrain) return;

    needDrain = !duplex.write(`a very loooooooooooooooooooooooooooooooooooooooooong message ${i}\n`); // write returns false if it needs drain
    console.log(needDrain);
    i++;
  }, 500);
}

test();
```

## 4. Roadmap

- Control center: List all/available clients
- Security
- Handle duplicated clientId/wrong param format
- Timeouts for functions
