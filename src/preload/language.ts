import {contextBridge,ipcRenderer} from 'electron';
import {languageFromArguments,type LanguageAPI} from '../shared/language';
const api:LanguageAPI={current:languageFromArguments(process.argv),state:()=>ipcRenderer.invoke('clipper:language-state')};
contextBridge.exposeInMainWorld('clipperLanguage',api);
