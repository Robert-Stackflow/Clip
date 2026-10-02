// Only the isolated folder test receiver enables this bridge. No application preload uses it.
const {contextBridge,webUtils}=require('electron');
contextBridge.exposeInMainWorld('folderReceiver',{paths:files=>Array.from(files).map(file=>webUtils.getPathForFile(file))});
