import './chrome';
import {fontResources} from './font-resources';
import {contextBridge,ipcRenderer} from 'electron';
import type {AppearanceAPI,AppearanceState} from '../shared/appearance';
const api:AppearanceAPI={retainFontResources:fontResources.retain,releaseFontResources:fontResources.release,state:()=>ipcRenderer.invoke('clip:appearance-state'),installedFonts:refresh=>ipcRenderer.invoke('clip:installed-fonts',refresh),uiFontSource:family=>ipcRenderer.invoke('clip:font-source',family),onChange:callback=>{const listener=(_event:Electron.IpcRendererEvent,state:AppearanceState)=>callback(state);ipcRenderer.on('clip:appearance-changed',listener);return ()=>ipcRenderer.removeListener('clip:appearance-changed',listener);}};
contextBridge.exposeInMainWorld('clipAppearance',api);
