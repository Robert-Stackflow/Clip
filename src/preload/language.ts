import {contextBridge,ipcRenderer} from 'electron';
import {languageFromArguments,type LanguageAPI} from '../shared/language';
const current=ipcRenderer.sendSync('clip:language-current');
const api:LanguageAPI={current:current==='en'||current==='zh-CN'?current:languageFromArguments(process.argv),state:()=>ipcRenderer.invoke('clip:language-state')};
contextBridge.exposeInMainWorld('clipLanguage',api);
