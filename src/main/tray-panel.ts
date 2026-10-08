import {t as tr,interfaceLanguageArguments} from '../shared/i18n';
import {BrowserWindow,screen,type Rectangle} from 'electron';
import {join} from 'node:path';
import type {Store} from './store';
import type {Detail,Snippet} from '../shared/types';
import type {ClipPreview} from '../shared/preview';
import {trayPanelBounds,type TrayState} from '../shared/tray';
import {QuickPreviewWindow} from './quick-preview';
import {hasClipFilters} from '../shared/clip-filters';
import type {QuickHoverRect} from '../shared/quick-preview';
import {TrayHistory} from './tray-history';
import {TraySearch} from './tray-search';
import {QuickReplies} from './quick-replies';
import {validateTrayQuery} from '../shared/tray';
import {foregroundBelongsTo,activateNativeWindow,mouseButtons} from './native';
import {contains} from '../shared/desktop';
import {PanelFocusGuard} from './panel-focus';
import {quickGlyph,anchoredQuickPanelBounds,type QuickGlyph} from '../shared/quick-panel';
interface Target{hwnd:number;pid:number;focus?:number}
interface Context{placement?(target?:Target):Promise<Rectangle>;hoverPreviewEnabled?():boolean;createReply?(value:{title:string;text:string},valid:()=>boolean):Promise<void>;source():string;key():Uint8Array|undefined;image?(window:BrowserWindow,item:ClipPreview):string;releaseImage?(owner:number):void;store():Store;blocked():boolean;dark():boolean;target():Target|undefined;validTarget(target:Target):boolean;main():void;copy(item:Detail,paste:boolean,target:Target|undefined,valid:()=>boolean):Promise<void>;drag(window:BrowserWindow,item:Detail,valid:()=>boolean):Promise<void>;text?(value:QuickGlyph,paste:boolean,target:Target|undefined,valid:()=>boolean):Promise<void>;action?(item:Detail,action:'pin'|'favorite'|'delete',valid:()=>boolean):Promise<void>;clear?(valid:()=>boolean):Promise<void>;reply?(item:Snippet,paste:boolean,values:unknown,target:Target|undefined,valid:()=>boolean):Promise<void>}
export class TrayPanel{
 private moveTimer?:NodeJS.Timeout;private focusing=false;private focusGuard?:PanelFocusGuard;private hoverPreview?:QuickPreviewWindow;
 get previewWindow(){return this.hoverPreview?.window;}
 private replies:QuickReplies;
 window?:BrowserWindow;private history:TrayHistory;private target?:Target;private busy=false;private serial=0;private opened=false;private loaded=false;private focusTimer?:NodeJS.Timeout;private idleTimer?:NodeJS.Timeout;private search=new TraySearch();private activate=true;private sticky=false;
 constructor(private ctx:Context,private page:'tray'|'quick'='tray'){this.history=new TrayHistory(ctx.store,Date.now,item=>this.window?ctx.image?.(this.window,item):undefined);this.replies=new QuickReplies(ctx.store);if(page==='quick')this.hoverPreview=new QuickPreviewWindow({parent:()=>this.window,valid:()=>this.hoverEnabled()&&!ctx.blocked()&&!this.busy&&this.opened&&!!this.window?.isVisible(),dark:ctx.dark,release:owner=>ctx.releaseImage?.(owner)});screen.on('display-added',this.close);screen.on('display-removed',this.close);screen.on('display-metrics-changed',this.close);}
 toggle(anchor?:Rectangle){if(this.opened){this.close();return;}this.open(anchor);}
 open(anchor?:Rectangle,options:{bounds?:Rectangle;activate?:boolean;sticky?:boolean}={}){
  if(this.ctx.blocked()){this.close();return;}this.close();clearTimeout(this.idleTimer);this.target=this.ctx.target();this.history.open();this.replies.open();this.opened=true;this.activate=options.activate??this.page!=='quick';this.sticky=!!options.sticky;
  const point=screen.getCursorScreenPoint(),bounds=anchor&&anchor.width>0&&anchor.height>0?anchor:{...point,width:1,height:1},area=screen.getDisplayNearestPoint(this.page==='quick'?{x:0,y:0}:{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2}).workArea,panelBounds=options.bounds||(this.page==='quick'?anchoredQuickPanelBounds(area):trayPanelBounds(bounds,area));
  if(this.page==='quick'&&!options.bounds&&this.ctx.placement){const serial=this.serial;void this.ctx.placement(this.target).then(bounds=>{if(serial===this.serial&&this.opened&&!this.ctx.blocked())this.openWindow(bounds);}).catch(()=>{if(serial===this.serial&&this.opened&&!this.ctx.blocked())this.openWindow(panelBounds);});return;}
  this.openWindow(panelBounds);
 }
 private openWindow(panelBounds:Rectangle){
  if(this.page==='quick'&&!this.activate&&this.target&&!foregroundBelongsTo(this.target.hwnd)){this.close();return;}
  if(this.window&&!this.window.isDestroyed()){this.window.setBounds(panelBounds);if(this.loaded)this.show();return;}
  const window=new BrowserWindow({...panelBounds,show:false,frame:true,titleBarStyle:'hidden',titleBarOverlay:false,thickFrame:true,hasShadow:true,resizable:false,maximizable:false,minimizable:false,skipTaskbar:true,alwaysOnTop:true,focusable:this.page!=='quick',title:tr(this.page==='quick'?'Clip · 快捷面板':'Clip · 最近记录'),backgroundColor:this.ctx.dark()?'#181818':'#fff',webPreferences:{additionalArguments:interfaceLanguageArguments(),preload:join(__dirname,'../preload/'+this.page+'.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});this.window=window;const owner=window.webContents.id;
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());window.webContents.on('will-attach-webview',e=>e.preventDefault());
  window.on('hide',()=>{if(this.opened&&!this.busy)this.close();});
  window.on('blur',()=>{if(this.page==='quick')this.checkFocus();});
  window.on('move',()=>this.hoverPreview?.hide());window.on('closed',()=>{this.hoverPreview?.close();this.ctx.releaseImage?.(owner);if(this.window===window){void this.search.cancel();clearInterval(this.focusTimer);this.focusTimer=undefined;this.window=undefined;this.loaded=false;this.opened=false;this.history.close();this.replies.close();this.target=undefined;this.serial++;}});
  window.once('ready-to-show',()=>{if(this.window!==window||window.isDestroyed())return;this.loaded=true;if(this.opened&&!this.ctx.blocked())this.show();});void window.loadURL('clip://app/'+this.page+'.html');
 }
 private show(){
  const window=this.window!;if(this.ctx.blocked()||!this.opened||window.isDestroyed())return;const serial=this.serial;
  const buttons=mouseButtons();this.focusGuard=new PanelFocusGuard(Date.now(),buttons.left||buttons.right||buttons.middle);
  window.setFocusable(this.activate);window.setAlwaysOnTop(true,'screen-saver');
  if(this.activate){this.focusing=true;try{window.show();window.moveTop();window.focus();activateNativeWindow(Number(window.getNativeWindowHandle().readBigUInt64LE()));}finally{this.focusing=false;}}else{window.showInactive();window.moveTop();}window.webContents.send('clip:tray-session',true);if(this.sticky)return;
  clearInterval(this.focusTimer);
  this.focusTimer=setInterval(()=>{if(serial===this.serial)this.checkFocus();},this.page==='quick'?50:150);this.focusTimer.unref();
 }
 focus(){this.available();const window=this.window!;this.activate=true;this.focusing=true;try{window.setFocusable(true);window.focus();activateNativeWindow(Number(window.getNativeWindowHandle().readBigUInt64LE()));}finally{this.focusing=false;}}
 private checkFocus(){
  const window=this.window;if(!this.opened||this.focusing||!window||window.isDestroyed()||!window.isVisible())return;
  const point=screen.getCursorScreenPoint(),preview=this.previewWindow,panelFocused=foregroundBelongsTo(Number(window.getNativeWindowHandle().readBigUInt64LE())),focused=panelFocused||!this.activate&&!!this.target&&foregroundBelongsTo(this.target.hwnd),buttons=mouseButtons();
  const inside=contains(window.getBounds(),point)||!!preview?.isVisible()&&contains(preview.getBounds(),point)||panelFocused&&!window.isFocused();
  if(this.focusGuard?.check(Date.now(),focused,inside,buttons.left||buttons.right||buttons.middle,this.busy))this.close();
 }
 private available(){if(this.ctx.blocked()||!this.opened||!this.window?.isVisible())throw new Error(tr('托盘面板已关闭或不可用'));}
 private stopMoving(){clearInterval(this.moveTimer);this.moveTimer=undefined;this.focusing=false;}
 move(){
  this.available();if(this.page!=='quick'||this.busy||this.moveTimer||!mouseButtons().left)return;this.hoverPreview?.hide();
  const window=this.window!,serial=this.serial,origin=screen.getCursorScreenPoint(),bounds=window.getBounds();this.focusing=true;
  let lastX=bounds.x,lastY=bounds.y;
  this.moveTimer=setInterval(()=>{if(serial!==this.serial||this.ctx.blocked()||window.isDestroyed()||!window.isVisible()||!mouseButtons().left){this.stopMoving();return;}const point=screen.getCursorScreenPoint(),x=Math.round(bounds.x+point.x-origin.x),y=Math.round(bounds.y+point.y-origin.y);if(x===lastX&&y===lastY)return;lastX=x;lastY=y;
   // Windows hidden title bars can grow on repeated setPosition calls. Move
   // with the original size, and never reapply bounds for a stationary cursor.
   window.setBounds({...bounds,x,y});
  },16);this.moveTimer.unref();
 }
 async createReply(value:unknown){
  this.available();if(this.page!=='quick'||!this.ctx.createReply||this.busy)throw new Error(tr('面板操作无效'));
  const draft=value as {title:string;text:string};if(typeof draft?.title!=='string'||!draft.title.trim()||draft.title.length>120)throw new Error(tr('填写标题，最多 120 字'));if(typeof draft.text!=='string'||!draft.text.trim()||draft.text.length>1_000_000)throw new Error(tr('请填写回复内容'));
  const serial=this.serial,store=this.ctx.store();this.busy=true;
  try{await this.ctx.createReply({title:draft.title,text:draft.text},()=>serial===this.serial&&!this.ctx.blocked()&&this.ctx.store()===store);}
  finally{if(serial===this.serial){this.busy=false;this.changed();}}
 }
 state(value:unknown):TrayState|Promise<TrayState>{this.available();if(this.busy)throw new Error(tr('请等待当前操作完成'));const query=validateTrayQuery(value),serial=this.serial;this.hoverPreview?.hide();
  const state=(result:Pick<TrayState,'items'|'total'|'counts'|'categories'>)=>{this.available();if(serial!==this.serial)throw new Error(tr('最近记录查询已取消'));return {...result,dark:this.ctx.dark(),canPaste:!!this.target&&this.ctx.validTarget(this.target)};};
  if(!query.text&&!query.category&&query.kind==='all'&&(!query.filters||!hasClipFilters(query.filters))){void this.search.cancel();return state(this.history.query(query,this.page==='quick'));}
  return this.history.queryAsync(query,async query=>{const result=await this.search.run(this.ctx.source(),query,this.ctx.key(),()=>serial===this.serial&&!this.ctx.blocked()&&!!this.window?.isVisible(),this.page==='quick');if(this.busy)throw new Error(tr('请等待当前操作完成'));return result;}).then(state);
 }
 private hoverEnabled(){return this.ctx.hoverPreviewEnabled?.()!==false;}
 hover(token:unknown,rect?:QuickHoverRect,immediate?:unknown){if(token===null){if(immediate===true)this.hoverPreview?.hide();else this.hoverPreview?.leave();return;}this.available();if(this.page!=='quick'||this.busy||typeof token!=='string')throw new Error(tr('面板操作无效'));if(!this.hoverEnabled()){this.hoverPreview?.hide();return;}this.hoverPreview?.show(rect!,window=>this.history.preview(token,false,item=>this.ctx.image?.(window,item)));}
 preview(token:string){this.available();return this.history.preview(token,this.page==='quick');}
 async use(token:string,paste:unknown){this.available();if(typeof paste!=='boolean')throw new Error(tr('粘贴参数无效'));if(this.busy)throw new Error(tr('请等待当前操作完成'));if(paste&&(!this.target||!this.ctx.validTarget(this.target)))throw new Error(tr('未找到粘贴目标，请先切换到目标应用，或使用复制'));const operation=this.history.operation(token),serial=this.serial,target=paste?this.target:undefined;this.busy=true;
  try{await this.ctx.copy(operation.item,paste,target,()=>serial===this.serial&&!this.ctx.blocked()&&operation.valid());if(serial===this.serial)this.close();}catch(e){if(serial===this.serial&&!this.window?.isVisible())this.close();throw e;}finally{if(serial===this.serial)this.busy=false;}
 }
 async drag(token:string){this.available();if(this.busy)throw new Error(tr('请等待当前操作完成'));const operation=this.history.operation(token);if(!['image','files'].includes(operation.item.kind))throw new Error(tr('仅图片与文件可以拖出'));const serial=this.serial,window=this.window!;this.busy=true;try{await this.ctx.drag(window,operation.item,()=>serial===this.serial&&!this.ctx.blocked()&&operation.valid());if(serial===this.serial)this.close();}catch(e){if(serial===this.serial&&!this.window?.isVisible())this.close();throw e;}finally{if(serial===this.serial)this.busy=false;}}
 async text(value:unknown,paste:unknown){
  this.available();if(this.page!=='quick'||!this.ctx.text||typeof paste!=='boolean'||this.busy)throw new Error(tr('面板操作无效'));
  const glyph=quickGlyph(value),serial=this.serial,target=paste?this.target:undefined;if(paste&&(!target||!this.ctx.validTarget(target)))throw new Error(tr('未找到粘贴目标，请使用复制'));
  this.busy=true;try{await this.ctx.text(glyph,paste,target,()=>serial===this.serial&&!this.ctx.blocked());if(serial===this.serial)this.close();}finally{if(serial===this.serial)this.busy=false;}
 }
 async action(token:string,action:unknown){
  this.available();if(this.page!=='quick'||!this.ctx.action||!['pin','favorite','delete'].includes(action as string)||this.busy)throw new Error(tr('面板操作无效'));
  const operation=this.history.operation(token),serial=this.serial;this.hoverPreview?.hide();this.busy=true;
  try{await this.ctx.action(operation.item,action as 'pin'|'favorite'|'delete',()=>serial===this.serial&&!this.ctx.blocked()&&operation.valid());}
  finally{if(serial===this.serial){this.busy=false;this.changed();}}
 }
 main(){this.available();this.close();this.ctx.main();}
 replyState(text:unknown){this.available();if(this.page!=='quick'||this.busy)throw new Error(tr('面板操作无效'));return {...this.replies.query(text),dark:this.ctx.dark(),canPaste:!!this.target&&this.ctx.validTarget(this.target)};}
 async reply(token:string,paste:unknown,values:unknown={}){
  this.available();if(this.page!=='quick'||!this.ctx.reply||typeof paste!=='boolean'||this.busy)throw new Error(tr('面板操作无效'));
  const operation=this.replies.operation(token),serial=this.serial,target=paste?this.target:undefined;
  if(paste&&(!target||!this.ctx.validTarget(target)))throw new Error(tr('未找到粘贴目标，请使用复制'));
  this.busy=true;try{await this.ctx.reply(operation.item,paste,values,target,()=>serial===this.serial&&!this.ctx.blocked()&&operation.valid());if(serial===this.serial)this.close();}finally{if(serial===this.serial)this.busy=false;}
 }
 async clear(){
  this.available();if(this.page!=='quick'||!this.ctx.clear||this.busy)throw new Error(tr('面板操作无效'));
  const serial=this.serial,store=this.ctx.store();this.busy=true;
  try{await this.ctx.clear(()=>serial===this.serial&&!this.ctx.blocked()&&this.ctx.store()===store);if(serial===this.serial)this.history.open();}
  finally{if(serial===this.serial){this.busy=false;this.changed();}}
 }
 changed(){this.hoverPreview?.hide();if(this.ctx.blocked()){this.close();return;}if(!this.busy&&this.opened&&this.window?.isVisible())this.window.webContents.send('clip:changed');}
 close=()=>{
  this.hoverPreview?.close();this.stopMoving();clearInterval(this.focusTimer);this.focusTimer=undefined;clearTimeout(this.idleTimer);const window=this.window;
  void this.search.cancel();this.opened=false;this.serial++;this.busy=false;this.target=undefined;this.history.close();this.replies.close();
  if(window&&!window.isDestroyed()){
   this.ctx.releaseImage?.(window.webContents.id);window.webContents.send('clip:tray-session',false);
   if(this.ctx.blocked()){this.window=undefined;this.loaded=false;window.destroy();}
   // Reuse the warm renderer for rapid consecutive invocations, then release
   // the hidden process rather than retaining its memory for a full minute.
   else{if(window.isVisible())window.hide();this.idleTimer=setTimeout(()=>{if(this.window===window&&!this.opened){this.window=undefined;this.loaded=false;window.destroy();}},8_000);this.idleTimer.unref();}
  }
 };
 stopSearch(){return this.search.cancel();}
 dispose(){this.hoverPreview?.dispose();this.close();clearTimeout(this.idleTimer);const window=this.window;this.window=undefined;this.loaded=false;if(window&&!window.isDestroyed())window.destroy();screen.removeListener('display-added',this.close);screen.removeListener('display-removed',this.close);screen.removeListener('display-metrics-changed',this.close);}
}
