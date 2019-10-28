const {SOCKET_EVENT} = require('../../../util/constants');

class P2pMessageApi {
  constructor(socket, clientId) {
    if (!socket || !clientId) throw new Error('P2pMessageApi constructor requires 2 parameters');

    this.socket = socket;
    this.clientId = clientId; //todo: move to Core

    this.socket.on(SOCKET_EVENT.P2P_REGISTER, (sourceClientId, callback) => {
      if (!this.targetClientId || this.targetClientId === sourceClientId) {
        this.targetClientId = sourceClientId;
        this.addPostRegisterListeners();
        callback(true);
      } else {
        callback(false);
      }
    });
    this.socket.on(SOCKET_EVENT.SERVER_ERROR, (err) => {
      console.error(`Error emitted from server: ${err}`);
    });

    this.p2pDisconnectListener = () => {
      if (this.targetClientId) delete this.targetClientId;
      this.removePostRegisterListeners();
    };
    this.p2pUnregisterListener = (callback) => {
      if (this.targetClientId) delete this.targetClientId;
      if (callback) callback();
      this.removePostRegisterListeners();
    };
  }

  addPostRegisterListeners() {
    this.socket.on(SOCKET_EVENT.P2P_DISCONNECT, this.p2pDisconnectListener);
    this.socket.on(SOCKET_EVENT.P2P_UNREGISTER, this.p2pUnregisterListener);
  }

  removePostRegisterListeners() {
    this.socket.off(SOCKET_EVENT.P2P_DISCONNECT, this.p2pDisconnectListener);
    this.socket.off(SOCKET_EVENT.P2P_UNREGISTER, this.p2pUnregisterListener);
  }

  //todo: test timeout
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

  registerP2pTarget(targetClientId, options = {}, callback) {
    if (this.clientId === targetClientId) throw new Error('Target client ID can not be the same as source client ID');
    if (this.targetClientId) throw new Error(`Current target: ${this.targetClientId}, targetClientId must be empty before registering`);
    const registerError = new Error('Target client refused connection');

    if (callback) {
      this.socket.emit(SOCKET_EVENT.P2P_REGISTER, targetClientId, (targetAcceptConnection) => {
        if (targetAcceptConnection) {
          this.targetClientId = targetClientId;
          this.options = options;
          this.addPostRegisterListeners();
          callback();
        } else {
          callback(registerError);
        }
      });
    } else {
      return new Promise((resolve, reject) => {
        this.socket.emit(SOCKET_EVENT.P2P_REGISTER, targetClientId, (targetAcceptConnection) => {
          if (targetAcceptConnection) {
            this.targetClientId = targetClientId;
            this.options = options;
            this.addPostRegisterListeners();
            resolve();
          } else {
            reject(registerError);
          }
        });
      });
    }
  }

  emit2(event, ...args) {
    if (!this.targetClientId) throw new Error('emit2 must be called after targetClientId is set');
    if (!event) throw new Error('event must be specified');

    // acknowledge case
    if (typeof args[arguments.length - 1] === 'function') {
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
}

module.exports = P2pMessageApi;
