import {contextBridge,ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('clipperSticker',{
 state:()=>ipcRenderer.invoke('clipper:sticker-state'),
 dragStart:()=>ipcRenderer.send('clipper:sticker-drag-start'),
 move:(deltaX:number,deltaY:number)=>ipcRenderer.send('clipper:sticker-move',deltaX,deltaY),
 dragEnd:()=>ipcRenderer.send('clipper:sticker-drag-end'),
 zoom:(direction:number,anchorX:number,anchorY:number)=>ipcRenderer.invoke('clipper:sticker-zoom',direction,anchorX,anchorY),
 close:()=>ipcRenderer.invoke('clipper:sticker-close')
});
