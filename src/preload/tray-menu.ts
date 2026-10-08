import './language';
import './appearance';
import {contextBridge,ipcRenderer} from 'electron';
import type {TrayMenuAction,TrayMenuView} from '../main/tray-menu';

export interface TrayMenuAPI {state():Promise<TrayMenuView>;action(id:TrayMenuAction):Promise<void>;hide():Promise<void>;ready(height:number):Promise<void>;onChange(callback:()=>void):()=>void}
const invoke=(name:string,...args:unknown[])=>ipcRenderer.invoke('clip:tray-menu-'+name,...args);
const api:TrayMenuAPI={state:()=>invoke('state'),action:id=>invoke('action',id),hide:()=>invoke('hide'),ready:height=>invoke('ready',height),onChange:callback=>{const listener=()=>callback();ipcRenderer.on('clip:tray-menu-changed',listener);return()=>ipcRenderer.removeListener('clip:tray-menu-changed',listener);}};
contextBridge.exposeInMainWorld('clipTrayMenu',api);
