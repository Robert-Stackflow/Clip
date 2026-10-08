import {contextBridge,ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('clipSticker',{
 state:()=>ipcRenderer.invoke('clip:sticker-state'),
 dragStart:()=>ipcRenderer.send('clip:sticker-drag-start'),
 move:(deltaX:number,deltaY:number)=>ipcRenderer.send('clip:sticker-move',deltaX,deltaY),
 dragEnd:()=>ipcRenderer.send('clip:sticker-drag-end'),
 zoom:(direction:number,anchorX:number,anchorY:number)=>ipcRenderer.invoke('clip:sticker-zoom',direction,anchorX,anchorY),
 close:()=>ipcRenderer.invoke('clip:sticker-close')
});
