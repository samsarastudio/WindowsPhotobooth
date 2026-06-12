const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pbApi', {
  getPaths: () => ipcRenderer.invoke('app:getPaths'),
  cameraInvoke: (cmd) => ipcRenderer.invoke('camera:invoke', cmd),
  readFileBase64: (filePath) => ipcRenderer.invoke('file:readBase64', filePath),
  fetchImageDataUrl: (url) => ipcRenderer.invoke('net:fetchImageDataUrl', url),
  saveJpeg: (fullPath, base64Body) => ipcRenderer.invoke('file:saveJpeg', fullPath, base64Body),
  adminGetConfig: () => ipcRenderer.invoke('admin:getConfig'),
  adminSaveConfig: (partial) => ipcRenderer.invoke('admin:saveConfig', partial),
  adminListThemes: () => ipcRenderer.invoke('admin:listThemes'),
  adminGetThemeStylesheetUrl: () => ipcRenderer.invoke('admin:getThemeStylesheetUrl'),
  adminPickThemeZip: () => ipcRenderer.invoke('admin:pickThemeZip'),
  adminInstallThemeFromZip: (zipPath) => ipcRenderer.invoke('admin:installThemeFromZip', zipPath),
  adminExportThemeZip: (themeId) => ipcRenderer.invoke('admin:exportThemeZip', themeId),
  adminDeleteTheme: (themeId) => ipcRenderer.invoke('admin:deleteTheme', themeId),
  adminExportThemeTemplate: () => ipcRenderer.invoke('admin:exportThemeTemplate'),
  adminVerifyPin: (pin) => ipcRenderer.invoke('admin:verifyPin', pin),
  adminPickLogoImage: () => ipcRenderer.invoke('admin:pickLogoImage'),
  adminInstallLogo: (sourcePath) => ipcRenderer.invoke('admin:installLogo', sourcePath),
  adminClearLogo: () => ipcRenderer.invoke('admin:clearLogo'),
  adminGetBrandingLogoUrl: () => ipcRenderer.invoke('admin:getBrandingLogoUrl'),
  openAiGenerateImage: (payload) => ipcRenderer.invoke('openai:generateImage', payload),
  scannerListPorts: () => ipcRenderer.invoke('scanner:listPorts'),
  scannerGetStatus: () => ipcRenderer.invoke('scanner:getStatus'),
  scannerOpen: (portPath, baudRate) => ipcRenderer.invoke('scanner:open', portPath, baudRate),
  scannerClose: () => ipcRenderer.invoke('scanner:close'),
  onScannerCode: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('scanner:code', handler);
    return () => ipcRenderer.removeListener('scanner:code', handler);
  },
  onScannerStatus: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('scanner:status', handler);
    return () => ipcRenderer.removeListener('scanner:status', handler);
  },
  onScannerError: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('scanner:error', handler);
    return () => ipcRenderer.removeListener('scanner:error', handler);
  },
  syncValidateToken: (token) => ipcRenderer.invoke('sync:validateToken', token),
  syncEnqueueSession: (entry) => ipcRenderer.invoke('sync:enqueueSession', entry),
  kiaValidateToken: (token) => ipcRenderer.invoke('kia:validateToken', token),
  kiaFetchFrames: () => ipcRenderer.invoke('kia:fetchFrames'),
  kiaBundledFrameAsset: (frameId, kind) => ipcRenderer.invoke('kia:bundledFrameAsset', frameId, kind),
  kiaEnqueueMedia: (entry) => ipcRenderer.invoke('kia:enqueueMedia', entry),
  kiaWaitForUpload: (uploadId, timeoutMs) =>
    ipcRenderer.invoke('kia:waitForUpload', uploadId, timeoutMs),
  kiaFetchGallery: () => ipcRenderer.invoke('kia:fetchGallery'),
  kiaGetUploadQueueStatus: () => ipcRenderer.invoke('kia:getUploadQueueStatus'),
  kiaTestConnection: () => ipcRenderer.invoke('kia:testConnection'),
  onKiaApiDebug: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('kia:apiDebug', handler);
    return () => ipcRenderer.removeListener('kia:apiDebug', handler);
  },
});
