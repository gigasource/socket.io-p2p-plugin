# socket.io-p2p-plugin

# 1. Overview
This library consists of 2 components:
  - P2P Server Plugin (src/p2p-server-plugin.js): plugin for [socket.io](https://www.npmjs.com/package/socket.io) lib
  - P2P Client Plugin (src/p2p-client-plugin.js): plugin for [socket.io-client](https://www.npmjs.com/package/socket.io-client) lib
  
In each component, the code is split into 4 APIs:
  - Core: consists of **common functions** for other APIs and **functions related to Socket.IO's basic features** such as room control (joinRoom, leaveRoom, emitRoom). 
  socket-based APIs are currently put in Core since there are too few to put them into a new file. Consider putting socket-based APIs into a new file if there will be more APIs.
  - Message: extended functions for Socket.IO. This API focuses on **sending messages from clients to clients** without having to know the details on Socket.IO server.
  - Stream: extended functions for Socket.IO. This API focuses on **interacting with NodeJS Stream API**, sending & receiving data between clients using streams.
  - Service: extended functions for Socket.IO. This API allows server & clients to become services to **provide/consume socket-based APIs** & create **subscriber/publisher relationship** to monitor data changes.

Glossary
- Server: Socket.IO server
- Client: Socket.IO clients
- Source client: the client that initially sends data
- Target client: the client that will receive data from source client

API details will be explained with this structure:
- Function explanation - You should read this and read the code simultaneously (functions not listed are self-explanatory)
- API requirements

# 2. P2P Server Plugin
The server must be started before client plugin can be used and before clients can connect to the server.

Code example to start server:
```$
const http = require('http');
const socketIO = require('socket.io');
const p2pServerPlugin = require('../src/p2p-server-plugin');

const httpServer = http.createServer((req, res) => res.end()).listen(9000);

const io = socketIO.listen(httpServer, {}); // see https://socket.io/docs/server-api/#new-Server-httpServer-options for server options

const server = p2pServerPlugin(io);
```

## 2.1 Server Core API
### 2.1.1 Function explanation:
- addClient/removeClient: add/remove from the clientMap to know which client is connected to the server.
  The structure of clientMap is:
  
```$
{
  clientIdA: 'socketId123', // clientId is set by client, socketId is generated randomly
  clientIdB: 'socketId456',
}
```

- getSocketByClientId: use clientId to find socketId, then socketId is used to get Socket object, the Socket object
  can use Socket.IO functions (emit, on, ...)
- emitError: logs an error using console.error & at the same time, emit the error to source client, client can listen to 
  this to catch errors
- createListeners: create the listeners for Socket.IO events:
  - disconnect: remove client from clientMap
  - P2P_EMIT: event used by clients to send data
  - P2P_EMIT_ACKNOWLEDGE: event used by clients to send data with acknowledge function
  - JOIN_ROOM, LEAVE_ROOM: control the joining/leaving room of sockets
  - EMIT_ROOM: emit data to all the sockets in a room
    
### 2.1.2 Requirements
- Connected clients must be added to clientMap
- Disconnected clients must be removed from clientMap
- A new socket is created when a client connects to server
- Every created socket must listen to P2P_EMIT, P2P_EMIT_ACKNOWLEDGE, JOIN_ROOM, LEAVE_ROOM & EMIT_ROOM events
- clientId is required & must be unique (currently there is no code mechanism to enforce uniqueness, clientId is set by client)
  
## 2.2 Server Message API
### 2.2.1 Function explanation:
- createListeners: create listener for MULTI_API_ADD_TARGET. Forward this event to target client & handle disconnection from both ends
### 2.2.2 Requirements:
- All connected sockets must listen to MULTI_API_ADD_TARGET event
- When a client disconnects, its targets must be notified with MULTI_API_TARGET_DISCONNECT event. a clientId is sent 
with MULTI_API_TARGET_DISCONNECT event so target clients can know which specific client disconnected
- If target client is not registered to server, send error to source client

## 2.3 Server Stream API
### 2.3.1 Function explanation:
- createListeners: the listener for MULTI_API_CREATE_STREAM is mostly similar to the listener for MULTI_API_ADD_TARGET
  but in MULTI_API_CREATE_STREAM, additional information is included: sourceStreamId, targetStreamId. The streamIds are used
  for identifying streams since 1 client can create multiple streams
### 2.3.2 Requirements:
- All connected sockets must listen to MULTI_API_CREATE_STREAM event
- Similar to second requirement in 2.2.2 -> for destroying streams related to a client when it disconnects
- Similar to third requirement in 2.2.2
- connectionInfo object must be included when MULTI_API_CREATE_STREAM event is sent

## 2.4 Server Service API
This API is similar to the API in client side, but we want the API usage to be transparent so an intercept mechanism
is used to intercept P2P_EMIT & P2P_EMIT_ACKNOWLEDGE events. If server has the requested service and can handle the request, 
the request will be intercepted, otherwise the request will be passed to client-side service to handle
### 2.4.1 Function explanation:
- this.interceptor: used to create the modified listeners for P2P_EMIT & P2P_EMIT_ACKNOWLEDGE events
- interceptP2pEmit: this function is called if ```{isService: true}``` is passed as parameter when server is created.
This will create a modified version of original listeners for P2P_EMIT & P2P_EMIT_ACKNOWLEDGE events to intercept the 
service requests from clients
- asService: because 1 instance of server can serve as multiple services, this function is used to create APIs as different services
- initTopicApis: create the listeners that allow clients to subscribe/unsubscribe to topics created by the services on server side
### 2.4.2 Requirements:
- 1 server instance can serve as multiple services
- Clients treat services created by server and services created by other clients alike (as if server is also client)
- APIs and topics can be created and destroyed
- Topics created can be subscribed to & messages can be published to topics by server
- Topics are basically just rooms of Socket.IO (we want to use subscriber/publisher pattern so we use the term 'topic')
  
## 3. P2P Client Plugin
Code example to create client:

```
const clientId = 'clientA'; // this should be unique, currently there is no code mechanism to enforce uniqueness
const socketClient = require('socket.io-client');
const p2pClientPlugin = require("../../../src/p2p-client-plugin");

const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${clientId}`);
const socket = p2pClientPlugin(rawSocket, clientId);
```

### 3.1 Client Core API
Core API is pretty simple so explanation is not necessary

### 3.2 Client Message API
#### 3.2.1 Function explanation
- addP2pTarget/onAddP2pTarget: most of the time client can not know the id of its peer, onAddP2pTarget is used to get 
id of peer (refer to examples for usage)
- onAny/onceAny/offAny: used for creating/removing listeners without clientId filtering
- from - on/once/off: used for creating/removing listeners with clientId filtering (accept events from specific clients only)
- emitTo: used to send data to a specific client
#### 3.2.2 Requirements
- When a target client disconnects, listeners related to that client must be removed from its peers
- Clients can listen to events from any other clients with 'onAny'
- Clients can listen to events from chosen clients only with 'from().on'
- 'once' and 'off' functions must work like basic socket.once & socket.off
- 'emitTo' must send data to correct target
- Relationship between clients is n-n

### 3.3 Client Stream API
#### 3.3.1 Function explanation
- addP2pStream: used to request connection between clients, if request succeed, a Duplex will be returned
- onAddP2pStream: used to handle connection request & create a Duplex if request is accepted
#### 3.3.2 Requirements
- 1 client can have multiple streams but relationship between streams is 1-1
- Streams with same client must have unique id for identifying purpose
- The Duplex returned must work like a NodeJS Duplex & must be able to send/receive data through network
- When client/stream is destroyed, its peer should be cleaned up correctly (remove socket listeners, destroy streams)

### 3.4 Client Service API
#### 3.4.1 Function explanation
- initTopicListeners: create listeners for handling topic subscription/unsubscription,
only clients created with ```{isService: true}``` can handle topic subscription/unsubscription.
- modifyTopicName: topic name can have conflicts between services so this function add a prefix to 
identify topics of different services
#### 3.4.2 Requirements
- Client can use services and be service at the same time
- 1 instance of client can only be 1 type of service

## 4. Code examples
Code examples are stored in /example, you can run file exec-file.js in each folder to automatically run files with correct order

## 5. Roadmap
- Security
- Handle duplicated clientId/invalid parameters
- Timeouts for functions
