const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktopFixture',{drag:()=>ipcRenderer.send('desktop-fixture:drag')});
