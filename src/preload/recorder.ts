import './language';
import './appearance';
import {contextBridge,ipcRenderer} from 'electron';
import type {RecorderAPI} from '../shared/recording';
const call=(name:string,...args:unknown[])=>ipcRenderer.invoke('clip:record-'+name,...args);
const listen=(name:string,callback:()=>void)=>{const listener=()=>callback();ipcRenderer.on(name,listener);return()=>ipcRenderer.removeListener(name,listener);};
const api:RecorderAPI={embedded:process.argv.includes('--clip-recording-embedded'),state:()=>call('state'),chooseRegion:source=>call('choose-region',source),beginMicrophoneList:()=>call('microphones-begin'),endMicrophoneList:token=>call('microphones-end',token),sources:type=>call('sources',type),arm:options=>call('arm',options),started:(token,mime)=>call('started',token,mime),chunk:(token,index,data)=>call('chunk',token,index,data),heartbeat:(token,seconds)=>call('heartbeat',token,seconds),paused:(token,paused)=>call('paused',token,paused),finish:(token,seconds,reason,mime)=>call('finish',token,seconds,reason,mime),cancel:()=>call('cancel'),fail:(token,message)=>call('fail',token,message),save:()=>call('save'),copySaved:()=>call('copy-saved'),onChange:cb=>{const a=listen('clip:record-changed',cb),b=listen('clip:changed',cb);return()=>{a();b();}},onStop:cb=>listen('clip:record-stop',cb)};
contextBridge.exposeInMainWorld('clipRecorder',api);
