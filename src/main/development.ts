import {app,BrowserWindow} from 'electron';
import {join,resolve,relative,isAbsolute} from 'node:path';

// A packaged application never accepts development commands or uses this profile.
export const development=!app.isPackaged&&process.env.CLIPPER_DEVELOPMENT==='1';
export const developmentHidden=development&&process.env.CLIPPER_DEV_HIDDEN==='1';
function profile(){
 const root=app.getAppPath(),directory=resolve(process.env.CLIPPER_DEV_DATA_DIR||join(root,'work/dev-profile'));
 const allowed=[join(root,'work/dev-profile'),join(root,'work/development')].some(base=>{const rel=relative(base,directory);return !isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..\\')&&!rel.startsWith('../');});
 if(!allowed)throw new Error('Development profile must remain inside work/dev-profile or work/development');
 return directory;
}
export const developmentDirectory=development?profile():undefined;
export function developmentMessage(value:object){if(development&&process.connected)process.send?.(value,()=>{});}
export function installDevelopmentBridge(busy:()=>boolean){
 if(!development)return;
 process.on('message',(message:unknown)=>{
  const type=(message as {type?:string}|null)?.type;
  if(type==='clipper:dev-quit'){app.quit();return;}
  if(type!=='clipper:dev-reload')return;
  if(busy()){developmentMessage({type:'clipper:dev-deferred'});return;}
  for(const window of BrowserWindow.getAllWindows())if(!window.isDestroyed())window.webContents.reloadIgnoringCache();
  developmentMessage({type:'clipper:dev-reloaded'});
 });
 process.on('disconnect',()=>app.quit());
}
