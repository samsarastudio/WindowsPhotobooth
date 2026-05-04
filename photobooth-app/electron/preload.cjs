const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pbApi', {
  getPaths: () => ipcRenderer.invoke('app:getPaths'),
  cameraInvoke: (cmd) => ipcRenderer.invoke('camera:invoke', cmd),
  readFileBase64: (filePath) => ipcRenderer.invoke('file:readBase64', filePath),
  saveJpeg: (fullPath, base64Body) => ipcRenderer.invoke('file:saveJpeg', fullPath, base64Body),
});
