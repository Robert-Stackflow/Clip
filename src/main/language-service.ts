import {BrowserWindow,ipcMain} from 'electron';
import {trustedAppearancePage} from '../shared/appearance';
import type {LanguageStore} from './language-store';
export function initLanguageService(store:LanguageStore){ipcMain.on('clip:language-current',event=>{event.returnValue=BrowserWindow.fromWebContents(event.sender)&&event.senderFrame===event.sender.mainFrame&&trustedAppearancePage(event.senderFrame.url)?store.state().current:null;});ipcMain.handle('clip:language-state',event=>{if(!BrowserWindow.fromWebContents(event.sender)||event.senderFrame!==event.sender.mainFrame||!trustedAppearancePage(event.senderFrame.url))throw new Error('Language access denied');return store.state();});}
