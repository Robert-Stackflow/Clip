import type {BrowserWindow} from 'electron';
const pending=new WeakMap<BrowserWindow,{dirty:boolean}>();
/** Hidden collection windows retain their UI, but receive one fresh state when reopened. */
export function watchCollectionWindow(window:BrowserWindow,suspend?:()=>void){
 if(pending.has(window))return;pending.set(window,{dirty:true});
 const flush=()=>flushCollectionWindow(window),pause=()=>{const state=pending.get(window);if(state)state.dirty=true;suspend?.();};
 window.on('show',flush);window.on('restore',flush);window.on('hide',pause);window.on('minimize',pause);
 window.webContents.on('did-finish-load',flush);window.once('closed',()=>{pending.delete(window);suspend?.();});
}
export function flushCollectionWindow(window:BrowserWindow){
 const state=pending.get(window);if(!state?.dirty||window.isDestroyed()||!window.isVisible()||window.isMinimized()||window.webContents.isLoading())return;
 window.webContents.send('clipper:changed');state.dirty=false;
}
export function notifyCollectionWindow(window:BrowserWindow){
 const state=pending.get(window);if(!state){window.webContents.send('clipper:changed');return;}state.dirty=true;flushCollectionWindow(window);
}
