import {contextBridge,ipcRenderer} from 'electron';
import type {ImageEditorAPI} from '../shared/image-edit';
const api:ImageEditorAPI={state:()=>ipcRenderer.invoke('clipper:image-state'),dirty:value=>ipcRenderer.invoke('clipper:image-dirty',value),save:(png,mode)=>ipcRenderer.invoke('clipper:image-save',png,mode),onChange:callback=>{const f=()=>callback();ipcRenderer.on('clipper:changed',f);return()=>ipcRenderer.removeListener('clipper:changed',f);}};
contextBridge.exposeInMainWorld('clipperImage',api);
