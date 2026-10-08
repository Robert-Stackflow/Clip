import './language';
import './appearance';
import {contextBridge,ipcRenderer} from 'electron';
import type {ImageEditorAPI} from '../shared/image-edit';
const api:ImageEditorAPI={state:()=>ipcRenderer.invoke('clip:image-state'),dirty:value=>ipcRenderer.invoke('clip:image-dirty',value),save:(png,mode)=>ipcRenderer.invoke('clip:image-save',png,mode),onChange:callback=>{const f=()=>callback();ipcRenderer.on('clip:changed',f);return()=>ipcRenderer.removeListener('clip:changed',f);}};
contextBridge.exposeInMainWorld('clipImage',api);
