import {app} from 'electron';
import {join,resolve} from 'node:path';
import {mkdirSync} from 'node:fs';
import {LanguageStore} from './language-store';
import {setInterfaceLanguage} from '../shared/i18n';
import {developmentDirectory} from './development';
// This must be the first import of the main entry, before display labels initialize.
const testing=process.env.CLIP_TEST_MODE==='1';
app.setName('Clip');
const dataRoot=developmentDirectory||(testing&&process.env.CLIP_DATA_DIR?resolve(process.env.CLIP_DATA_DIR):join(app.getPath('appData'),'Clip'));
for(const directory of [dataRoot,join(dataRoot,'session'),join(dataRoot,'logs'),join(dataRoot,'crash-dumps')])mkdirSync(directory,{recursive:true});
app.setPath('userData',dataRoot);
app.setPath('sessionData',join(dataRoot,'session'));
app.setAppLogsPath(join(dataRoot,'logs'));
app.setPath('crashDumps',join(dataRoot,'crash-dumps'));
let systemLanguage='en';try{systemLanguage=app.getPreferredSystemLanguages()[0]||'en';}catch{}
export const languageStore=new LanguageStore(join(app.getPath('userData'),'language.json'),systemLanguage);
const current=languageStore.state().current;setInterfaceLanguage(current);process.env.CLIP_UI_LANGUAGE=current;
