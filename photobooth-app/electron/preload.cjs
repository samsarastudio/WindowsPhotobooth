const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pbApi', {
  getPaths: () => ipcRenderer.invoke('app:getPaths'),
  cameraInvoke: (cmd) => ipcRenderer.invoke('camera:invoke', cmd),
  readFileBase64: (filePath) => ipcRenderer.invoke('file:readBase64', filePath),
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
});
