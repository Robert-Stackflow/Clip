const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('setup', {
  state: () => ipcRenderer.invoke('setup:state'),
  chooseDirectory: () => ipcRenderer.invoke('setup:choose-directory'),
  install: directory => ipcRenderer.invoke('setup:install', directory),
  launch: () => ipcRenderer.invoke('setup:launch'),
  minimize: () => ipcRenderer.invoke('setup:minimize'),
  close: () => ipcRenderer.invoke('setup:close'),
  onProgress: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('setup:progress', listener);
    return () => ipcRenderer.removeListener('setup:progress', listener);
  }
});
