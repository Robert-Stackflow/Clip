import {app} from 'electron';
import {join,resolve} from 'node:path';
import {LanguageStore} from './language-store';
import {setInterfaceLanguage} from '../shared/i18n';
// This must be the first import of the main entry, before display labels initialize.
const testing=process.env.CLIPPER_TEST_MODE==='1';
app.setName('Clipper');
app.setPath('userData',testing&&process.env.CLIPPER_DATA_DIR?resolve(process.env.CLIPPER_DATA_DIR):join(app.getPath('appData'),'Clipper'));
let systemLanguage='en';try{systemLanguage=app.getPreferredSystemLanguages()[0]||'en';}catch{}
export const languageStore=new LanguageStore(join(app.getPath('userData'),'language.json'),systemLanguage);
const current=languageStore.state().current;setInterfaceLanguage(current);process.env.CLIPPER_UI_LANGUAGE=current;
