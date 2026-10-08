import {BrowserWindow,ipcMain,screen,type Rectangle} from 'electron';
import {join} from 'node:path';
import {interfaceLanguageArguments,t as tr} from '../shared/i18n';
import {trayMenuEntries,type TrayMenuAction,type TrayMenuActions,type TrayMenuState,type TrayMenuView} from './tray-menu';

const width=292;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
export function trayMenuBounds(anchor:Rectangle,area:Rectangle,contentHeight:number):Rectangle{
 const menuHeight=Math.min(Math.ceil(contentHeight),area.height),left=area.x,right=area.x+area.width,top=area.y,bottom=area.y+area.height;
 const x=clamp(Math.round(anchor.x+anchor.width/2-width/2),left,Math.max(left,right-width));
 const below=anchor.y+anchor.height+8,above=anchor.y-menuHeight-8;
 const y=below+menuHeight<=bottom?below:above>=top?above:clamp(Math.round(anchor.y+anchor.height/2-menuHeight/2),top,bottom-menuHeight);
 return {x,y,width:Math.min(width,area.width),height:menuHeight};
}

export class TrayMenuPanel {
 window?:BrowserWindow;
 private opened=false;
 private placement?:{anchor:Rectangle;area:Rectangle};
 private idleTimer?:NodeJS.Timeout;
 private focusTimer?:NodeJS.Timeout;
 private state:TrayMenuState={initializing:true,secured:true,stackActive:false,paused:false,encrypted:false,launchAtLogin:false};
 private actions?:TrayMenuActions;
 constructor(private dark:()=>boolean){
  ipcMain.handle('clip:tray-menu-state',event=>{this.verify(event.sender,event.senderFrame);return this.view();});
  ipcMain.handle('clip:tray-menu-action',(event,value:unknown)=>{
   this.verify(event.sender,event.senderFrame);
   if(typeof value!=='string'||!trayMenuEntries(this.state).some(item=>item.id===value))throw new Error(tr('菜单操作不可用'));
   const action=this.actions?.[value as TrayMenuAction];if(!action)throw new Error(tr('菜单操作不可用'));
   if(!['stack','pause','startup'].includes(value))this.close();return action();
  });
  ipcMain.handle('clip:tray-menu-hide',event=>{this.verify(event.sender,event.senderFrame);this.close();});
  ipcMain.handle('clip:tray-menu-ready',(event,height:unknown)=>{
   this.verify(event.sender,event.senderFrame);
   if(typeof height!=='number'||!Number.isFinite(height)||height<1||height>32768)throw new Error(tr('菜单操作不可用'));
   if(this.placement){const {anchor,area}=this.placement;this.window!.setBounds(trayMenuBounds(anchor,area,height));}
   if(!this.window!.isVisible())this.show();
  });
 }
 private verify(sender:Electron.WebContents,frame:Electron.WebFrameMain|null){
  if(!this.opened||this.window?.webContents!==sender||!frame||frame!==sender.mainFrame||frame.url!=='clip://app/tray-menu.html')throw new Error(tr('拒绝访问'));
 }
 private view():TrayMenuView{return {entries:trayMenuEntries(this.state),dark:this.dark(),initializing:this.state.initializing,secured:this.state.secured,paused:this.state.paused,stackActive:this.state.stackActive};}
 configure(state:TrayMenuState,actions:TrayMenuActions){const shapeChanged=this.state.initializing!==state.initializing||this.state.secured!==state.secured||this.state.encrypted!==state.encrypted;this.state=state;this.actions=actions;if(shapeChanged&&this.opened){this.close();return;}if(this.opened&&this.window&&!this.window.isDestroyed())this.window.webContents.send('clip:tray-menu-changed');}
 toggle(anchor?:Rectangle){if(this.opened&&this.window?.isVisible()){this.close();return;}this.open(anchor);}
 open(anchor?:Rectangle){
  this.close();clearTimeout(this.idleTimer);this.idleTimer=undefined;this.opened=true;
  const point=screen.getCursorScreenPoint(),target=anchor&&anchor.width>0&&anchor.height>0?anchor:{...point,width:1,height:1};
  const area=screen.getDisplayNearestPoint({x:target.x+target.width/2,y:target.y+target.height/2}).workArea,bounds=trayMenuBounds(target,area,area.height);this.placement={anchor:target,area};
  if(this.window&&!this.window.isDestroyed()){this.window.setBounds(bounds);this.window.webContents.send('clip:tray-menu-changed');return;}
  const window=new BrowserWindow({...bounds,show:false,frame:false,transparent:false,roundedCorners:true,resizable:false,maximizable:false,minimizable:false,skipTaskbar:true,alwaysOnTop:true,hasShadow:true,backgroundColor:this.dark()?'#181818':'#ffffff',title:tr('Clip 菜单'),webPreferences:{additionalArguments:interfaceLanguageArguments(),preload:join(__dirname,'../preload/tray-menu.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  this.window=window;
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.on('blur',()=>{if(this.opened)this.close();});
  window.on('closed',()=>{if(this.window===window){this.window=undefined;this.opened=false;}});
  void window.loadURL('clip://app/tray-menu.html');
 }
 private show(){const window=this.window;if(!window||window.isDestroyed()||!this.opened)return;window.show();window.focus();clearTimeout(this.focusTimer);this.focusTimer=setTimeout(()=>{if(this.opened&&this.window===window&&window.isVisible())window.focus();},80);}
 close(){this.opened=false;this.placement=undefined;clearTimeout(this.focusTimer);this.focusTimer=undefined;const window=this.window;if(!window||window.isDestroyed())return;if(window.isVisible())window.hide();clearTimeout(this.idleTimer);this.idleTimer=setTimeout(()=>{if(this.window===window&&!this.opened){this.window=undefined;window.destroy();}},8_000);this.idleTimer.unref();}
 dispose(){this.close();clearTimeout(this.idleTimer);const window=this.window;this.window=undefined;if(window&&!window.isDestroyed())window.destroy();for(const name of ['state','action','hide','ready'])ipcMain.removeHandler('clip:tray-menu-'+name);}
}
