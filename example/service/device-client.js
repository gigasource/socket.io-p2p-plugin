const sourceClientId = 'device-1';
const p2pClientPlugin = require("../../src/p2p-client-plugin");
const socketClient = require('socket.io-client');
const rawSocket = socketClient.connect(`http://localhost:9000?clientId=${sourceClientId}`);
const socket = p2pClientPlugin(rawSocket, sourceClientId);

(() => {
  const downloadFile = (fileName, jobId) => {
    socket.emitService('job', 'getFileInfo', {fileName}, (fileToDownload) => {
      if (!fileToDownload) return;

      const {fileName, size} = fileToDownload;
      let downloaded = 0;
      const downloadTask = setInterval(() => {
        if (downloaded === size) {
          clearInterval(downloadTask);
          return;
        }

        const status = {
          jobId,
          jobStatus: `Downloaded ${Math.round(downloaded++ / size * 100)}% of file ${fileName}`,
        };
        socket.emitService('job', 'update', status);
        console.log(status.jobStatus);
      }, 1000);
    });
  };

  socket.onService('job', 'downloadFile', (jobId, {files}) => {
    files.forEach(file => {
      downloadFile(file, jobId);
    });
  });
})();
