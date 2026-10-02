import {t as tr} from '../shared/i18n';
import {interfaceLanguageArguments} from '../shared/i18n';
import {BrowserWindow,screen,type Rectangle} from 'electron';
import {join} from 'node:path';
import type {Store} from './store';
import type {Detail} from '../shared/types';
import type {ClipPreview} from '../shared/preview';
import {trayPanelBounds, type TrayState} from '../shared/tray';
import {TrayHistory} from './tray-history';
import {foregroundBelongsTo} from './native';
interface Target{hwnd:number;pid:number}
interface Context{image?(window:BrowserWindow,item:ClipPreview):string;releaseImage?(owner:number):void;store():Store;blocked():boolean;dark():boolean;target():Target|undefined;validTarget(target:Target):boolean;main():void;copy(item:Detail,paste:boolean,target:Target|undefined,valid:()=>boolean):Promise<void>;drag(window:BrowserWindow,item:Detail,valid:()=>boolean):Promise<void>}
export class TrayPanel{
 window?:BrowserWindow;private history:TrayHistory;private target?:Target;private busy=false;private serial=0;private focusTimer?:NodeJS.Timeout;
 constructor(private ctx:Context){this.history=new TrayHistory(ctx.store,Date.now,item=>this.window?ctx.image?.(this.window,item):undefined);screen.on('display-added',this.close);screen.on('display-removed',this.close);screen.on('display-metrics-changed',this.close);}
 toggle(anchor?:Rectangle){if(this.window?.isVisible()){this.close();return;}this.open(anchor);}
 open(anchor?:Rectangle){if(this.ctx.blocked())return;this.close();this.target=this.ctx.target();this.history.open();const serial=this.serial,point=screen.getCursorScreenPoint(),bounds=anchor&&anchor.width>0&&anchor.height>0?anchor:{...point,width:1,height:1},area=screen.getDisplayNearestPoint({x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2}).workArea,dark=this.ctx.dark();
  const window=new BrowserWindow({...trayPanelBounds(bounds,area),show:false,frame:true,titleBarStyle:'hidden',titleBarOverlay:false,thickFrame:true,hasShadow:true,resizable:false,maximizable:false,minimizable:false,skipTaskbar:true,alwaysOnTop:true,title:tr('Clipper · 最近记录'),backgroundColor:dark?'#181818':'#fff',webPreferences:{additionalArguments:interfaceLanguageArguments(),preload:join(__dirname,'../preload/tray.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});this.window=window;const owner=window.webContents.id;
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());window.webContents.on('will-attach-webview',e=>e.preventDefault());
  window.on('blur',()=>{if(!this.busy)this.close();});window.on('hide',()=>{if(!this.busy)this.close();});window.on('closed',()=>{this.ctx.releaseImage?.(owner);if(this.window===window){clearInterval(this.focusTimer);this.focusTimer=undefined;this.window=undefined;this.history.close();this.target=undefined;this.serial++;}});
  window.once('ready-to-show',()=>{if(this.ctx.blocked()||serial!==this.serial||window.isDestroyed())return;window.show();window.focus();window.webContents.send('clipper:changed');const hwnd=Number(window.getNativeWindowHandle().readBigUInt64LE());let misses=0;this.focusTimer=setInterval(()=>{if(serial!==this.serial)return;if(this.busy){misses=0;return;}if(foregroundBelongsTo(hwnd))misses=0;else if(++misses>=3)this.close();},150);this.focusTimer.unref();});void window.loadURL('clipper://app/tray.html');
 }
 private available(){if(this.ctx.blocked()||!this.window?.isVisible())throw new Error(tr('托盘面板已关闭或不可用'));}
 state(query:unknown):TrayState{this.available();if(this.busy)throw new Error(tr('请等待当前操作完成'));return {...this.history.query(query),dark:this.ctx.dark(),canPaste:!!this.target&&this.ctx.validTarget(this.target)};}
 preview(token:string){this.available();return this.history.preview(token);}
 async use(token:string,paste:unknown){this.available();if(typeof paste!=='boolean')throw new Error(tr('粘贴参数无效'));if(this.busy)throw new Error(tr('请等待当前操作完成'));if(paste&&(!this.target||!this.ctx.validTarget(this.target)))throw new Error(tr('未找到粘贴目标，请先切换到目标应用，或使用复制'));const operation=this.history.operation(token),serial=this.serial,target=paste?this.target:undefined;this.busy=true;
  try{await this.ctx.copy(operation.item,paste,target,()=>serial===this.serial&&!this.ctx.blocked()&&operation.valid());if(serial===this.serial)this.close();}catch(e){if(serial===this.serial&&!this.window?.isVisible())this.close();throw e;}finally{if(serial===this.serial)this.busy=false;}
 }
 async drag(token:string){this.available();if(this.busy)throw new Error(tr('请等待当前操作完成'));const operation=this.history.operation(token);if(!['image','files'].includes(operation.item.kind))throw new Error(tr('仅图片与文件可以拖出'));const serial=this.serial,window=this.window!;this.busy=true;try{await this.ctx.drag(window,operation.item,()=>serial===this.serial&&!this.ctx.blocked()&&operation.valid());if(serial===this.serial)this.close();}catch(e){if(serial===this.serial&&!this.window?.isVisible())this.close();throw e;}finally{if(serial===this.serial)this.busy=false;}}
 main(){this.available();this.close();this.ctx.main();}
 changed(){if(this.ctx.blocked()){this.close();return;}if(!this.busy&&this.window?.isVisible())this.window.webContents.send('clipper:changed');}
 close=()=>{clearInterval(this.focusTimer);this.focusTimer=undefined;const window=this.window;if(window&&!window.isDestroyed())this.ctx.releaseImage?.(window.webContents.id);this.window=undefined;this.serial++;this.busy=false;this.target=undefined;this.history.close();if(window&&!window.isDestroyed())window.destroy();};
 dispose(){this.close();screen.removeListener('display-added',this.close);screen.removeListener('display-removed',this.close);screen.removeListener('display-metrics-changed',this.close);}
}
