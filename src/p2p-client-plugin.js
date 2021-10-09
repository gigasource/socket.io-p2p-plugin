const {SOCKET_EVENT} = require('./util/constants');

class NewApi {
  constructor(io, clientId) {
    this.io = io;
    this.clientId = clientId;
    this.targetClientId = null;

    this.io.on(SOCKET_EVENT.P2P_REGISTER, sourceClientId => {
      this.targetClientId = sourceClientId;
      this.io.emit(SOCKET_EVENT.P2P_REGISTER_SUCCESS);
    });

    this.io.on(SOCKET_EVENT.P2P_DISCONNECT, () => {
      console.warn(`Target client disconnected.`)
    });

    this.io.on(SOCKET_EVENT.P2P_UNREGISTER, (doneCallback) => {
      if (this.targetClientId) delete this.targetClientId;
      doneCallback();
    });

    this.io.on(SOCKET_EVENT.SERVER_ERROR, (err) => {
      console.error(`Error emitted from server: ${err}`);
    })
  }

  unregisterP2pTarget(doneCallback) {
    if (doneCallback) {
      if (this.targetClientId) {
        this.io.emit(SOCKET_EVENT.P2P_UNREGISTER, doneCallback);
        delete this.targetClientId;
      } else {
        doneCallback();
      }
    } else {
      return new Promise(resolve => {
        if (this.targetClientId) {
          this.io.emit(SOCKET_EVENT.P2P_UNREGISTER, () => {
            resolve();
          });
          delete this.targetClientId;
        } else {
          resolve();
        }
      });
    }

  }

  /**
   * @param targetClientId Id of the client you want to connect to
   * @param options Not yet used
   * @param successCallbackFn
   * @param failureCallbackFn
   * @returns 1. No callbacks: true if connect successfully, false otherwise; 2. With callbacks: doesn't return anything
   */
  registerP2pTarget(targetClientId, options = {}, successCallbackFn, failureCallbackFn) {
    if (this.clientId === targetClientId) throw new Error('Target client ID can not be the same as source client ID');
    if (this.targetClientId) throw new Error(`Current target: ${this.targetClientId}, targetClientId must be empty before registering`);

    if (successCallbackFn || failureCallbackFn) {
      this.io.emit(SOCKET_EVENT.P2P_REGISTER, targetClientId, (targetAvailable) => {
        if (targetAvailable) {
          this.targetClientId = targetClientId;
          this.options = options;
          if (successCallbackFn) successCallbackFn();
        } else {
          if (failureCallbackFn) failureCallbackFn();
        }
      });
    } else {
      return new Promise(resolve => {
        this.io.emit(SOCKET_EVENT.P2P_REGISTER, targetClientId, (targetAvailable) => {
          if (targetAvailable) {
            this.targetClientId = targetClientId;
            this.options = options;
            resolve(true);
          } else {
            resolve(false);
          }
        });
      });
    }
  }

  emit2() {
    if (!this.targetClientId) throw new Error('emit2 must be called after targetClientId is set');

    const [event, ...args] = arguments;

    if (!event) throw new Error('event must be specified');

    // acknowledge case
    if (typeof arguments[arguments.length - 1] === 'function') {
      const acknowledgeCallbackFn = args.pop(); // last arg is acknowledge callback function

      this.io.emit(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE, {
        targetClientId: this.targetClientId,
        event,
        args,
      }, acknowledgeCallbackFn);
    }
    // no acknowledge case
    else {
      this.io.emit(SOCKET_EVENT.P2P_EMIT, {
        targetClientId: this.targetClientId,
        event,
        args,
      });
    }
  }

  getClientList(successCallbackFn) {
    if (successCallbackFn) {
      this.io.emit(SOCKET_EVENT.LIST_CLIENTS, (clientList) => {
        successCallbackFn(clientList);
      });
    } else {
      return new Promise(resolve => {
        this.io.emit(SOCKET_EVENT.LIST_CLIENTS, (clientList) => {
          resolve(clientList);
        });
      });
    }
  }

  isClientConnected(clientId, successCallbackFn) {
    if (successCallbackFn) {
      this.io.emit(SOCKET_EVENT.GET_CLIENT_CONNECTED_STATUS, clientId, (connectedStatus) => {
        successCallbackFn(connectedStatus)
      })
    } else {
      return new Promise(resolve => {
        this.io.emit(SOCKET_EVENT.GET_CLIENT_CONNECTED_STATUS, clientId, (connectedStatus) => {
          resolve(connectedStatus)
        })
      })
    }
  }
}

module.exports = function p2pClientPlugin(io, clientId) {
  const newApi = new NewApi(io, clientId);
  return new Proxy(io, {
    get: (obj, prop) => {

      if (prop === 'registerP2pTarget') return newApi.registerP2pTarget.bind(newApi);
      if (prop === 'unregisterP2pTarget') return newApi.unregisterP2pTarget.bind(newApi);
      if (prop === 'emit2' || prop === 'emitP2p') return newApi.emit2.bind(newApi);
      if (prop === 'getClientList') return newApi.getClientList.bind(newApi);
      if (prop === 'targetClientId') return newApi.targetClientId;
      if (prop === 'isClientConnected') return newApi.isClientConnected.bind(newApi);

      return obj[prop];
    }
  });
};
