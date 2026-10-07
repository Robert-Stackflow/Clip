import './language';
import './appearance';
import {contextBridge,ipcRenderer} from 'electron';
import type {QuickAPI} from '../shared/quick-panel';
const invoke=(name:string,...args:unknown[])=>ipcRenderer.invoke('clipper:quick-'+name,...args);
const event=(name:string,callback:(value:any)=>void)=>{const listener=(_event:unknown,value:any)=>callback(value);ipcRenderer.on(name,listener);return()=>ipcRenderer.removeListener(name,listener);};
const api:QuickAPI={createReply:value=>invoke('create-reply',value),move:()=>invoke('move'),hover:(token,rect,immediate)=>invoke('hover',token,rect,immediate),clear:()=>invoke('clear'),replies:text=>invoke('replies',text),reply:(token,paste,values)=>invoke('reply',token,paste,values),state:query=>invoke('state',query),preview:token=>invoke('preview',token),use:(token,paste)=>invoke('use',token,paste),text:(value,paste)=>invoke('text',value,paste),action:(token,action)=>invoke('action',token,action),hide:()=>invoke('hide'),main:()=>invoke('main'),appIcons:names=>invoke('app-icons',names),onChange:callback=>event('clipper:changed',callback),onSession:callback=>event('clipper:tray-session',value=>callback(value===true)),onNotice:callback=>event('clipper:notice',callback)};
contextBridge.exposeInMainWorld('clipperQuick',api);
