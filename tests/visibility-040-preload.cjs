const {contextBridge,webFrame}=require('electron');
// Diagnostics exist only in this private hidden test preload, never in the product API.
contextBridge.exposeInMainWorld('privateProbe',{resources:()=>webFrame.getResourceUsage()});
