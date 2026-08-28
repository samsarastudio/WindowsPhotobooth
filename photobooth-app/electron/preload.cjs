const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pbApi', {
  getPaths: () => ipcRenderer.invoke('app:getPaths'),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkBoothUpdate: (payload) => ipcRenderer.invoke('app:checkBoothUpdate', payload || {}),
  log: (payload) => ipcRenderer.invoke('app:log', payload),
  readLogTail: (payload) => ipcRenderer.invoke('app:readLogTail', payload || {}),
  openLogsFolder: () => ipcRenderer.invoke('app:openLogsFolder'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  onAppLogEntry: (cb) => {
    const handler = (_event, entry) => cb(entry);
    ipcRenderer.on('app:log-entry', handler);
    return () => ipcRenderer.removeListener('app:log-entry', handler);
  },
  cameraInvoke: (cmd) => ipcRenderer.invoke('camera:invoke', cmd),
  listCaptureHistory: (options) => ipcRenderer.invoke('capture:listHistory', options || {}),
  readFileBase64: (filePath) => ipcRenderer.invoke('file:readBase64', filePath),
  saveJpeg: (fullPath, base64Body) => ipcRenderer.invoke('file:saveJpeg', fullPath, base64Body),
  adminGetConfig: () => ipcRenderer.invoke('admin:getConfig'),
  adminSaveConfig: (partial) => ipcRenderer.invoke('admin:saveConfig', partial),
  adminTestOpenAiKey: (draftKey) => ipcRenderer.invoke('admin:testOpenAiKey', draftKey),
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
  adminPickAiLogoImage: () => ipcRenderer.invoke('admin:pickAiLogoImage'),
  adminInstallAiLogo: (sourcePath) => ipcRenderer.invoke('admin:installAiLogo', sourcePath),
  adminClearAiLogo: () => ipcRenderer.invoke('admin:clearAiLogo'),
  adminGetAiBrandLogoUrl: () => ipcRenderer.invoke('admin:getAiBrandLogoUrl'),
  adminListAiBackgrounds: (modeId) => ipcRenderer.invoke('admin:listAiBackgrounds', modeId),
  adminPickAiBackgroundImage: () => ipcRenderer.invoke('admin:pickAiBackgroundImage'),
  adminInstallAiBackground: (modeId, sourcePath) =>
    ipcRenderer.invoke('admin:installAiBackground', modeId, sourcePath),
  adminDeleteAiBackground: (modeId, filename) =>
    ipcRenderer.invoke('admin:deleteAiBackground', modeId, filename),
  openAiGenerateImage: (payload) => ipcRenderer.invoke('openai:generateImage', payload),
  listPhotoFrames: () => ipcRenderer.invoke('frames:list'),
  applyPhotoFrame: (payload) => ipcRenderer.invoke('frames:apply', payload),
  applyPhysicalFrameLayout: (payload) =>
    ipcRenderer.invoke('layouts:physicalFrameDual', payload || {}),
  adminPickPhotoFrameImage: () => ipcRenderer.invoke('admin:pickPhotoFrameImage'),
  adminInstallPhotoFrame: (sourcePath) => ipcRenderer.invoke('admin:installPhotoFrame', sourcePath),
  adminDeletePhotoFrame: (filename) => ipcRenderer.invoke('admin:deletePhotoFrame', filename),
  galleryEnsureDaySession: (payload) => ipcRenderer.invoke('gallery:ensureDaySession', payload),
  galleryUploadPhoto: (payload) => ipcRenderer.invoke('gallery:uploadPhoto', payload),
  galleryFlushUploadQueue: () => ipcRenderer.invoke('gallery:flushUploadQueue'),
  galleryGetUploadQueueSummary: () => ipcRenderer.invoke('gallery:getUploadQueueSummary'),
  galleryResyncUploadQueue: (payload) => ipcRenderer.invoke('gallery:resyncUploadQueue', payload),
  galleryGetUploadQueueItem: (filePath) => ipcRenderer.invoke('gallery:getUploadQueueItem', filePath),
  onGalleryUploadQueueUpdated: (cb) => {
    const handler = (_event, item) => cb(item);
    ipcRenderer.on('gallery:upload-queue-updated', handler);
    return () => ipcRenderer.removeListener('gallery:upload-queue-updated', handler);
  },
  gallerySyncFrames: (payload) => ipcRenderer.invoke('gallery:syncFrames', payload),
  galleryPublishFrame: (payload) => ipcRenderer.invoke('gallery:publishFrame', payload),
  galleryDeleteRemoteFrame: (payload) => ipcRenderer.invoke('gallery:deleteRemoteFrame', payload),
  listPrinters: () => ipcRenderer.invoke('print:listPrinters'),
  printPhoto: (payload) => ipcRenderer.invoke('print:photo', payload),
  printTest: () => ipcRenderer.invoke('print:test'),
});
