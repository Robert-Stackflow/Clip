import './chrome';
import {fontResources} from './font-resources';
import {contextBridge,ipcRenderer} from 'electron';
import type {AppearanceAPI,AppearanceState} from '../shared/appearance';
const api:AppearanceAPI={retainFontResources:fontResources.retain,releaseFontResources:fontResources.release,state:()=>ipcRenderer.invoke('clipper:appearance-state'),installedFonts:refresh=>ipcRenderer.invoke('clipper:installed-fonts',refresh),uiFontSource:family=>ipcRenderer.invoke('clipper:font-source',family),onChange:callback=>{const listener=(_event:Electron.IpcRendererEvent,state:AppearanceState)=>callback(state);ipcRenderer.on('clipper:appearance-changed',listener);return ()=>ipcRenderer.removeListener('clipper:appearance-changed',listener);}};
contextBridge.exposeInMainWorld('clipperAppearance',api);
