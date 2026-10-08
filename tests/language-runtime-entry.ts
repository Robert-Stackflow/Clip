// Runs production language bootstrap, store, service and all sandboxed preloads.
// Hidden isolated windows only; no clipboard, shortcuts or input APIs are imported.
import {languageStore} from '../src/main/language-bootstrap';
import {initLanguageService} from '../src/main/language-service';
import {interfaceLanguageArguments} from '../src/shared/i18n';
import {resolveLanguage} from '../src/shared/language';
import {app,BrowserWindow,ipcMain,protocol} from 'electron';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';

protocol.registerSchemesAsPrivileged([{scheme:'clip',privileges:{standard:true,secure:true}}]);
initLanguageService(languageStore);
ipcMain.handle('clip:language-save',(_event,value)=>languageStore.save(value));
const phase=process.env.CLIP_LANGUAGE_PHASE!;
const output=process.env.CLIP_LANGUAGE_REPORT!;
const preloadDirectory=process.env.CLIP_LANGUAGE_PRELOADS!;
const windows:BrowserWindow[]=[];
const timeout=setTimeout(()=>{writeFileSync(output,JSON.stringify({passed:false,error:'Runtime timeout'}));app.exit(1);},25000);
app.whenReady().then(async()=>{
  protocol.handle('clip',()=>new Response('<!doctype html><html><head><meta charset="utf-8"></head><body>Language runtime check</body></html>',{headers:{'content-type':'text/html; charset=utf-8'}}));
  const preferred=app.getPreferredSystemLanguages()[0]||'en';
  const expected=phase==='english'?'en':phase==='system'?resolveLanguage('system',preferred):'zh-CN';
  assert.equal(languageStore.state().current,expected);
  assert.equal(process.env.CLIP_UI_LANGUAGE,expected);
  const bindings=[['index','index'],['tray','tray'],['shelf','shelf'],['capture','capture'],['recorder','recorder'],['image-editor','image-editor'],['unlock','unlock'],['recovery','recovery']];
  const checked=[];
  for(const [page,preload] of bindings){
    const window=new BrowserWindow({show:false,skipTaskbar:true,webPreferences:{additionalArguments:interfaceLanguageArguments(),preload:join(preloadDirectory,preload+'.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
    windows.push(window);
    await window.loadURL('clip://app/'+page+'.html');
    const value=await window.webContents.executeJavaScript('(async()=>({current:window.clipLanguage.current,state:await window.clipLanguage.state(),node:typeof require}))()');
    assert.equal(value.current,expected,page);
    assert.equal(value.state.current,expected,page);
    assert.equal(value.node,'undefined',page);
    assert.equal(window.isVisible(),false,page);
    checked.push(page);
  }
  const main=windows[0];
  const next=phase==='default'?'en':phase==='english'?'zh-CN':'system';
  const state=await main.webContents.executeJavaScript('window.clip.configureLanguage('+JSON.stringify(next)+')');
  assert.equal(state.choice,next);
  assert.equal(state.current,resolveLanguage(next,preferred));
  assert.equal(state.next,resolveLanguage(next,preferred));
  assert.equal(state.restartRequired,false);
  for(const window of windows)assert.equal(await window.webContents.executeJavaScript('window.clipLanguage.current'),expected);await main.webContents.reload();await new Promise<void>(resolve=>main.webContents.once('did-finish-load',()=>resolve()));assert.equal(await main.webContents.executeJavaScript('window.clipLanguage.current'),state.current);
  writeFileSync(output,JSON.stringify({passed:true,phase,current:expected,preferred,checked,state},null,2));
  clearTimeout(timeout);
  for(const window of windows)window.destroy();
  app.exit(0);
}).catch(error=>{clearTimeout(timeout);writeFileSync(output,JSON.stringify({passed:false,error:String(error),stack:error.stack},null,2));for(const window of windows)window.destroy();app.exit(1);});
