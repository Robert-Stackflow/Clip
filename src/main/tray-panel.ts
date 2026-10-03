import {t as tr,interfaceLanguageArguments} from '../shared/i18n';
import {BrowserWindow,screen,type Rectangle} from 'electron';
import {join} from 'node:path';
import type {Store} from './store';
import type {Detail} from '../shared/types';
import type {ClipPreview} from '../shared/preview';
import {trayPanelBounds,type TrayState} from '../shared/tray';
import {TrayHistory} from './tray-history';
import {TraySearch} from './tray-search';
import {validateTrayQuery} from '../shared/tray';
import {foregroundBelongsTo} from './native';
interface Target{hwnd:number;pid:number}
interface Context{source():string;key():Uint8Array|undefined;image?(window:BrowserWindow,item:ClipPreview):string;releaseImage?(owner:number):void;store():Store;blocked():boolean;dark():boolean;target():Target|undefined;validTarget(target:Target):boolean;main():void;copy(item:Detail,paste:boolean,target:Target|undefined,valid:()=>boolean):Promise<void>;drag(window:BrowserWindow,item:Detail,valid:()=>boolean):Promise<void>}
export class TrayPanel{
 window?:BrowserWindow;private history:TrayHistory;private target?:Target;private busy=false;private serial=0;private opened=false;private loaded=false;private focusTimer?:NodeJS.Timeout;private idleTimer?:NodeJS.Timeout;private search=new TraySearch();
 constructor(private ctx:Context){this.history=new TrayHistory(ctx.store,Date.now,item=>this.window?ctx.image?.(this.window,item):undefined);screen.on('display-added',this.close);screen.on('display-removed',this.close);screen.on('display-metrics-changed',this.close);}
 toggle(anchor?:Rectangle){if(this.window?.isVisible()){this.close();return;}this.open(anchor);}
 open(anchor?:Rectangle){
  if(this.ctx.blocked()){this.close();return;}this.close();clearTimeout(this.idleTimer);this.target=this.ctx.target();this.history.open();this.opened=true;
  const point=screen.getCursorScreenPoint(),bounds=anchor&&anchor.width>0&&anchor.height>0?anchor:{...point,width:1,height:1},area=screen.getDisplayNearestPoint({x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2}).workArea;
  if(this.window&&!this.window.isDestroyed()){this.window.setBounds(trayPanelBounds(bounds,area));if(this.loaded)this.show();return;}
  const window=new BrowserWindow({...trayPanelBounds(bounds,area),show:false,frame:true,titleBarStyle:'hidden',titleBarOverlay:false,thickFrame:true,hasShadow:true,resizable:false,maximizable:false,minimizable:false,skipTaskbar:true,alwaysOnTop:true,title:tr('Clipper · 最近记录'),backgroundColor:this.ctx.dark()?'#181818':'#fff',webPreferences:{additionalArguments:interfaceLanguageArguments(),preload:join(__dirname,'../preload/tray.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});this.window=window;const owner=window.webContents.id;
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());window.webContents.on('will-attach-webview',e=>e.preventDefault());
  window.on('blur',()=>{if(!this.busy)this.close();});window.on('hide',()=>{if(this.opened&&!this.busy)this.close();});
  window.on('closed',()=>{this.ctx.releaseImage?.(owner);if(this.window===window){void this.search.cancel();clearInterval(this.focusTimer);this.focusTimer=undefined;this.window=undefined;this.loaded=false;this.opened=false;this.history.close();this.target=undefined;this.serial++;}});
  window.once('ready-to-show',()=>{this.loaded=true;if(this.window===window&&this.opened&&!this.ctx.blocked()&&!window.isDestroyed())this.show();});void window.loadURL('clipper://app/tray.html');
 }
 private show(){
  const window=this.window!;if(this.ctx.blocked()||!this.opened||window.isDestroyed())return;const serial=this.serial;
  window.show();window.focus();window.webContents.send('clipper:tray-session',true);
  const hwnd=Number(window.getNativeWindowHandle().readBigUInt64LE());let misses=0;clearInterval(this.focusTimer);
  this.focusTimer=setInterval(()=>{if(serial!==this.serial)return;if(this.busy){misses=0;return;}if(foregroundBelongsTo(hwnd))misses=0;else if(++misses>=3)this.close();},150);this.focusTimer.unref();
 }
 private available(){if(this.ctx.blocked()||!this.opened||!this.window?.isVisible())throw new Error(tr('托盘面板已关闭或不可用'));}
 state(value:unknown):TrayState|Promise<TrayState>{this.available();if(this.busy)throw new Error(tr('请等待当前操作完成'));const query=validateTrayQuery(value),serial=this.serial;
  const state=(result:Pick<TrayState,'items'|'total'|'categories'>)=>{this.available();if(serial!==this.serial)throw new Error(tr('最近记录查询已取消'));return {...result,dark:this.ctx.dark(),canPaste:!!this.target&&this.ctx.validTarget(this.target)};};
  if(!query.text&&!query.category&&query.kind==='all'){void this.search.cancel();return state(this.history.query(query));}
  return this.history.queryAsync(query,query=>this.search.run(this.ctx.source(),query,this.ctx.key(),()=>serial===this.serial&&!this.ctx.blocked()&&!!this.window?.isVisible())).then(state);
 }
 preview(token:string){this.available();return this.history.preview(token);}
 async use(token:string,paste:unknown){this.available();if(typeof paste!=='boolean')throw new Error(tr('粘贴参数无效'));if(this.busy)throw new Error(tr('请等待当前操作完成'));if(paste&&(!this.target||!this.ctx.validTarget(this.target)))throw new Error(tr('未找到粘贴目标，请先切换到目标应用，或使用复制'));const operation=this.history.operation(token),serial=this.serial,target=paste?this.target:undefined;this.busy=true;
  try{await this.ctx.copy(operation.item,paste,target,()=>serial===this.serial&&!this.ctx.blocked()&&operation.valid());if(serial===this.serial)this.close();}catch(e){if(serial===this.serial&&!this.window?.isVisible())this.close();throw e;}finally{if(serial===this.serial)this.busy=false;}
 }
 async drag(token:string){this.available();if(this.busy)throw new Error(tr('请等待当前操作完成'));const operation=this.history.operation(token);if(!['image','files'].includes(operation.item.kind))throw new Error(tr('仅图片与文件可以拖出'));const serial=this.serial,window=this.window!;this.busy=true;try{await this.ctx.drag(window,operation.item,()=>serial===this.serial&&!this.ctx.blocked()&&operation.valid());if(serial===this.serial)this.close();}catch(e){if(serial===this.serial&&!this.window?.isVisible())this.close();throw e;}finally{if(serial===this.serial)this.busy=false;}}
 main(){this.available();this.close();this.ctx.main();}
 changed(){if(this.ctx.blocked()){this.close();return;}if(!this.busy&&this.opened&&this.window?.isVisible())this.window.webContents.send('clipper:changed');}
 close=()=>{
  clearInterval(this.focusTimer);this.focusTimer=undefined;clearTimeout(this.idleTimer);const window=this.window;
  void this.search.cancel();this.opened=false;this.serial++;this.busy=false;this.target=undefined;this.history.close();
  if(window&&!window.isDestroyed()){
   this.ctx.releaseImage?.(window.webContents.id);window.webContents.send('clipper:tray-session',false);
   if(this.ctx.blocked()){this.window=undefined;this.loaded=false;window.destroy();}
   else{if(window.isVisible())window.hide();this.idleTimer=setTimeout(()=>{if(this.window===window&&!this.opened){this.window=undefined;this.loaded=false;window.destroy();}},60_000);this.idleTimer.unref();}
  }
 };
 stopSearch(){return this.search.cancel();}
 dispose(){this.close();clearTimeout(this.idleTimer);const window=this.window;this.window=undefined;this.loaded=false;if(window&&!window.isDestroyed())window.destroy();screen.removeListener('display-added',this.close);screen.removeListener('display-removed',this.close);screen.removeListener('display-metrics-changed',this.close);}
}
