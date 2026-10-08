import {contextBridge,ipcRenderer} from 'electron';
import type {ChromeAPI,WindowState,WindowConfirmation} from '../shared/chrome';
const api:ChromeAPI={state:()=>ipcRenderer.invoke('clip:chrome-state'),action:kind=>ipcRenderer.invoke('clip:chrome-action',kind),onChange:callback=>{const fn=(_event:unknown,state:WindowState)=>callback(state);ipcRenderer.on('clip:chrome-changed',fn);return()=>ipcRenderer.removeListener('clip:chrome-changed',fn);},onConfirm:callback=>{const fn=(_event:unknown,request:WindowConfirmation)=>callback(request);ipcRenderer.on('clip:window-confirm',fn);return()=>ipcRenderer.removeListener('clip:window-confirm',fn);},answerConfirm:(token,response)=>ipcRenderer.invoke('clip:window-confirm-answer',token,response)};
contextBridge.exposeInMainWorld('clipChrome',api);
