const {SOCKET_EVENT} = require('../util/constants');

class P2pMessageApi {
  constructor(socket, clientId) {
    if (!socket || !clientId) throw new Error('P2pMessageApi constructor requires 2 parameters');

    this.socket = socket;
    this.clientId = clientId;

    this.socket.on(SOCKET_EVENT.P2P_REGISTER, (sourceClientId, callback) => {
      if (!this.targetClientId || this.targetClientId === sourceClientId) {
        this.targetClientId = sourceClientId;
        callback(true);
      } else {
        callback(false);
      }
    });

    this.socket.on(SOCKET_EVENT.P2P_DISCONNECT, () => {
      if (this.targetClientId) delete this.targetClientId;
    });

    this.socket.on(SOCKET_EVENT.P2P_UNREGISTER, callback => {
      if (this.targetClientId) delete this.targetClientId;
      callback();
    });

    this.socket.on(SOCKET_EVENT.SERVER_ERROR, (err) => {
      console.error(`Error emitted from server: ${err}`);
    });
  }

  unregisterP2pTarget(callback) {
    if (callback) {
      const callbackTimeout = setTimeout(callback, 3000);

      callback = new Proxy(callback, {
        apply: (target, thisArg, args) => {
          clearTimeout(callbackTimeout);
          target.apply(thisArg, args);
        }
      });

      if (this.targetClientId) {
        this.socket.emit(SOCKET_EVENT.P2P_UNREGISTER, callback);
        delete this.targetClientId;
      } else {
        callback();
      }
    } else {
      return new Promise(resolve => {
        const resolveTimeout = setTimeout(resolve, 3000);

        resolve = new Proxy(resolve, {
          apply: (target, thisArg, args) => {
            clearTimeout(resolveTimeout);
            target(args);
          }
        });

        if (this.targetClientId) {
          this.socket.emit(SOCKET_EVENT.P2P_UNREGISTER, resolve);
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
      this.socket.emit(SOCKET_EVENT.P2P_REGISTER, targetClientId, (targetAvailable) => {
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
        this.socket.emit(SOCKET_EVENT.P2P_REGISTER, targetClientId, targetAvailable => {
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

      this.socket.emit(SOCKET_EVENT.P2P_EMIT_ACKNOWLEDGE, {
        targetClientId: this.targetClientId,
        event,
        args,
      }, acknowledgeCallbackFn);
    }
    // no acknowledge case
    else {
      this.socket.emit(SOCKET_EVENT.P2P_EMIT, {
        targetClientId: this.targetClientId,
        event,
        args,
      });
    }
  }

  getClientList(successCallbackFn) {
    if (successCallbackFn) {
      this.socket.emit(SOCKET_EVENT.LIST_CLIENTS, (clientList) => {
        successCallbackFn(clientList);
      });
    } else {
      return new Promise(resolve => {
        this.socket.emit(SOCKET_EVENT.LIST_CLIENTS, (clientList) => {
          resolve(clientList);
        });
      });
    }
  }
}

module.exports = P2pMessageApi;
