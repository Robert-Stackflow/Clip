import './language';
import './appearance';
import {contextBridge,ipcRenderer} from 'electron';
import type {TrayMenuAction,TrayMenuView} from '../main/tray-menu';

export interface TrayMenuAPI {state():Promise<TrayMenuView>;action(id:TrayMenuAction):Promise<void>;hide():Promise<void>;ready():Promise<void>;onChange(callback:()=>void):()=>void}
const invoke=(name:string,...args:unknown[])=>ipcRenderer.invoke('clipper:tray-menu-'+name,...args);
const api:TrayMenuAPI={state:()=>invoke('state'),action:id=>invoke('action',id),hide:()=>invoke('hide'),ready:()=>invoke('ready'),onChange:callback=>{const listener=()=>callback();ipcRenderer.on('clipper:tray-menu-changed',listener);return()=>ipcRenderer.removeListener('clipper:tray-menu-changed',listener);}};
contextBridge.exposeInMainWorld('clipperTrayMenu',api);
