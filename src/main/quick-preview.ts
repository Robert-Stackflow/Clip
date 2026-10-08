import {BrowserWindow,ipcMain,screen} from 'electron';
import {join} from 'node:path';
import {interfaceLanguageArguments,t as tr} from '../shared/i18n';
import {quickPreviewPlacement,type QuickHoverRect,type QuickPreviewState} from '../shared/quick-preview';
import type {TrayPreview} from '../shared/tray';
/** A non-activating companion: hovering never changes the captured paste target. */
export class QuickPreviewWindow{
 window?:BrowserWindow;private loaded=false;private value?:QuickPreviewState;private hideTimer?:NodeJS.Timeout;private cursorTimer?:NodeJS.Timeout;private disposed=false;
 constructor(private ctx:{parent():BrowserWindow|undefined;valid():boolean;dark():boolean;release(owner:number):void}){ipcMain.on('clip:quick-preview-presence',this.presence);}
 private cancelHide(){clearTimeout(this.hideTimer);this.hideTimer=undefined;}
 private presence=(event:Electron.IpcMainEvent,inside:unknown)=>{if(event.sender!==this.window?.webContents||event.senderFrame!==event.sender.mainFrame||event.senderFrame.url!=='clip://app/quick-preview.html')return;if(inside===true)this.cancelHide();else if(inside===false)this.leave();};
 show(rect:QuickHoverRect,read:(window:BrowserWindow)=>TrayPreview){
  const parent=this.ctx.parent();if(this.disposed||!this.ctx.valid()||!parent||parent.isDestroyed())return;
  const content=parent.getContentBounds();if(!rect||[rect.left,rect.top,rect.width,rect.height].some(value=>typeof value!=='number'||!Number.isFinite(value))||rect.width<=0||rect.height<=0||rect.left<0||rect.top<0||rect.left+rect.width>content.width+2||rect.top+rect.height>content.height+2)throw new Error(tr('面板位置无效'));
  this.cancelHide();const anchor={x:content.x+rect.left,y:content.y+rect.top,width:rect.width,height:rect.height},area=screen.getDisplayMatching(parent.getBounds()).workArea,placement=quickPreviewPlacement(parent.getBounds(),anchor,area);
  let window=this.window;
  if(!window||window.isDestroyed()){
   window=new BrowserWindow({...placement.bounds,show:false,frame:true,titleBarStyle:'hidden',titleBarOverlay:false,thickFrame:true,hasShadow:true,backgroundColor:this.ctx.dark()?'#181818':'#fff',resizable:false,focusable:false,skipTaskbar:true,alwaysOnTop:true,title:tr('预览'),webPreferences:{additionalArguments:interfaceLanguageArguments(),preload:join(__dirname,'../preload/quick-preview.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});this.window=window;const owner=window.webContents.id;
   window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());window.webContents.on('will-attach-webview',event=>event.preventDefault());
   window.on('closed',()=>{this.ctx.release(owner);if(this.window===window){this.window=undefined;this.loaded=false;this.value=undefined;clearInterval(this.cursorTimer);}});
   window.once('ready-to-show',()=>{if(this.window!==window)return;this.loaded=true;this.display();});void window.loadURL('clip://app/quick-preview.html');
  }else window.setBounds(placement.bounds);
  window.setBackgroundColor(this.ctx.dark()?'#181818':'#fff');this.ctx.release(window.webContents.id);try{this.value={item:read(window),side:placement.side,arrow:placement.arrow,dark:this.ctx.dark()};}catch(error){this.hide();throw error;}
  this.display();clearInterval(this.cursorTimer);
  // Also handle leaving the native surfaces when renderer pointer events are missed.
  const bridge={x:Math.min(anchor.x,placement.bounds.x),y:Math.min(anchor.y,placement.bounds.y),right:Math.max(anchor.x+anchor.width,placement.bounds.x+placement.bounds.width),bottom:Math.max(anchor.y+anchor.height,placement.bounds.y+placement.bounds.height)};
  this.cursorTimer=setInterval(()=>{if(!this.ctx.valid()){this.hide();return;}const point=screen.getCursorScreenPoint();if(point.x<bridge.x||point.x>bridge.right||point.y<bridge.y||point.y>bridge.bottom)this.leave();},120);this.cursorTimer.unref();
 }
 private display(){if(this.loaded&&this.value&&this.window&&!this.window.isDestroyed()&&this.ctx.valid()){this.window.webContents.send('clip:quick-preview-state',this.value);this.window.setAlwaysOnTop(true,'screen-saver');this.window.showInactive();this.window.moveTop();}}
 leave(){if(this.hideTimer)return;this.hideTimer=setTimeout(()=>this.hide(),250);this.hideTimer.unref();}
 hide(){this.cancelHide();clearInterval(this.cursorTimer);this.cursorTimer=undefined;this.value=undefined;const window=this.window;if(window&&!window.isDestroyed()){window.webContents.send('clip:quick-preview-state',null);this.ctx.release(window.webContents.id);window.hide();}}
 close(){this.hide();const window=this.window;this.window=undefined;this.loaded=false;if(window&&!window.isDestroyed())window.destroy();}
 dispose(){this.disposed=true;this.close();ipcMain.removeListener('clip:quick-preview-presence',this.presence);}
}
