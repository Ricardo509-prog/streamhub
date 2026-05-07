const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.send('open-external', url),
  onUpdate: (callback) => ipcRenderer.on('update', callback)
});

// Expose backend URL
contextBridge.exposeInMainWorld('BACKEND_URL', 'http://localhost:3000');
