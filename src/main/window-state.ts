import type {BrowserWindow} from 'electron';
import {trustedAppearancePage} from '../shared/appearance';
import type {WindowState} from '../shared/chrome';
export function nativeWindowState(window:BrowserWindow):WindowState{
 return {maximized:window.isMaximized(),maximizable:window.isMaximizable(),minimizable:window.isMinimizable(),visible:window.isVisible()&&!window.isMinimized()};
}
export function watchNativeWindowState(window:BrowserWindow){
 const changed=()=>{if(window.isDestroyed()||window.webContents.isDestroyed()||!trustedAppearancePage(window.webContents.getURL()))return;window.webContents.send('clip:chrome-changed',nativeWindowState(window));};
 window.on('maximize',changed);window.on('unmaximize',changed);window.on('show',changed);window.on('hide',changed);window.on('minimize',changed);window.on('restore',changed);
 window.webContents.on('did-finish-load',changed);
}
