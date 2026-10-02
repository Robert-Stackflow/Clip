import {t as tr} from '../shared/i18n';
import {interfaceLanguageArguments,interfaceLanguage} from '../shared/i18n';
import {BrowserWindow,screen,app} from 'electron';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {foreground,mouseButtons,nativeAvailable,selectionKeyDown} from './native';
import {contains} from '../shared/desktop';
import {selectionDefaults,validateSelection,selectionBounds,type SelectionOptions,type SelectionView,type SelectionInput,type SelectionAction,type SelectionRequest,type SelectionRead} from '../shared/selection';
import {SelectionReader} from './selection-reader';
import type {Store} from './store';
interface Target {hwnd:number;pid:number;name:string}
interface Snapshot {token:string;text:string;target:Target;point:{x:number;y:number};readPoint:{x:number;y:number};expires:number;keyboard:boolean}
interface Context {store():Store;blocked():boolean;dark():boolean;changed():void;show():void;notice(text:string):void;commit(action:'copy'|'save',text:string,source:string,valid:()=>boolean):Promise<void>}
const messages:Record<SelectionRead['status'],string>={ok:'',none:'没有选中文字。请先在其他应用选中文字，再按划词快捷键。',unsupported:'此应用未提供选区接口，可先复制后从历史中处理。',protected:'密码控件中的内容不会读取。',stale:'目标窗口已改变，请重新选择文字。',large:'选区过长，最多选择 32,768 个字符。',unavailable:'目标应用暂时无法提供选中文字。'};
export class SelectionService {
 window?:BrowserWindow;private reader:SelectionReader;private timer?:NodeJS.Timeout;private delay?:NodeJS.Timeout;private optionsValue:SelectionOptions;private snapshot?:Snapshot;private pending?:SelectionInput;private generation=0;private disposed=false;private previousLeft=false;private previousEscape=false;private busy=false;private reading=false;private status='';private ignoreKeysUntil=0;
 constructor(private ctx:Context){this.optionsValue=validateSelection(ctx.store().meta('selection-options',selectionDefaults));this.reader=new SelectionReader(app.isPackaged?join(process.resourcesPath,'app.asar.unpacked','dist','native','SelectionHost.exe'):join(__dirname,'../native/SelectionHost.exe'));this.updatePolling();}
 private updatePolling(){const needed=!this.disposed&&(this.optionsValue.enabled||this.reading||!!this.snapshot);if(needed&&!this.timer){this.previousLeft=false;this.previousEscape=false;this.timer=setInterval(()=>this.tick(),70);this.timer.unref();}else if(!needed&&this.timer){clearInterval(this.timer);this.timer=undefined;this.previousLeft=false;this.previousEscape=false;}}
 get options(){return this.optionsValue;}
 state(){return {options:this.options,status:this.status};}
 configure(value:SelectionOptions){this.ctx.store().setMeta('selection-options',value);this.optionsValue=value;this.clear();this.ctx.changed();}
 private allowed(target:Target|null):target is Target{return !!target&&target.pid!==process.pid&&!this.ctx.store().settings.excludedApps.includes(target.name.toLowerCase())&&!this.options.excludedApps.includes(target.name.toLowerCase());}
 private clear(){this.generation++;clearTimeout(this.delay);this.reader.cancel();this.reading=false;this.busy=false;this.snapshot=undefined;if(this.window&&!this.window.isDestroyed()){this.window.hide();this.window.webContents.send('clipper:selection-changed');}this.updatePolling();}
 suspend(){this.clear();this.pending=undefined;}
 private valid(snapshot:Snapshot){if(this.disposed||this.ctx.blocked()||this.snapshot!==snapshot||snapshot.expires<Date.now())return false;const f=foreground();return !!(f&&(f.hwnd===snapshot.target.hwnd&&f.pid===snapshot.target.pid||snapshot.keyboard&&this.window?.isFocused()&&f.hwnd===this.windowHandle()));}
 private windowHandle(){return this.window&&!this.window.isDestroyed()?Number(this.window.getNativeWindowHandle().readBigUInt64LE()):0;}
 private request(target:Target,point:{x:number;y:number},allowMenu=false):SelectionRequest{const physical=screen.dipToScreenPoint(point);return {id:randomUUID(),hwnd:target.hwnd,pid:target.pid,x:physical.x,y:physical.y,allowedForeground:allowMenu?this.windowHandle():0};}
 async read(keyboard=false){if(this.disposed||this.ctx.blocked())return;const target=foreground();if(!this.allowed(target)){if(keyboard){this.ctx.show();this.ctx.notice(tr('请在允许的外部应用中选中文字后使用划词快捷键。'));}return;}this.clear();const generation=this.generation,point=screen.getCursorScreenPoint();this.reading=true;this.updatePolling();this.ignoreKeysUntil=Date.now()+(keyboard?400:0);
  try{const result=await this.reader.read(this.request(target,point));if(this.disposed||this.ctx.blocked()||generation!==this.generation)return;this.reading=false;this.status=tr(messages[result.status]);if(result.status!=='ok'){if(keyboard){this.ctx.show();this.ctx.notice(this.status);}return;}const now=foreground();if(!now||now.hwnd!==target.hwnd||now.pid!==target.pid||!this.allowed(now))return;
   const rect=result.rects.at(-1),readPoint=rect?screen.screenToDipPoint({x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)}):point;this.snapshot={token:randomUUID(),text:result.text!,target,point:keyboard?readPoint:point,readPoint,expires:Date.now()+30000,keyboard};this.display(this.snapshot);
  }catch(e){if(generation!==this.generation||this.disposed||this.ctx.blocked())return;this.reading=false;this.status=String((e as Error).message);if(keyboard){this.ctx.show();this.ctx.notice(this.status);}}finally{if(generation===this.generation){this.reading=false;this.updatePolling();}}
 }
 private display(snapshot:Snapshot){const panelWidth=interfaceLanguage()==='en'?560:430;let window=this.window;if(!window||window.isDestroyed()){window=new BrowserWindow({width:panelWidth,height:96,frame:false,resizable:false,show:false,skipTaskbar:true,alwaysOnTop:true,focusable:snapshot.keyboard,backgroundColor:this.ctx.dark()?'#181818':'#ffffff',webPreferences:{additionalArguments:interfaceLanguageArguments(),preload:join(__dirname,'../preload/selection.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});this.window=window;window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());window.webContents.on('will-attach-webview',e=>e.preventDefault());window.on('close',e=>{if(!this.disposed){e.preventDefault();this.clear();}});window.on('blur',()=>{if(this.snapshot?.keyboard)this.clear();});void window.loadURL('clipper://app/selection.html');}
  window.setFocusable(snapshot.keyboard);const show=()=>{if(!this.valid(snapshot)||!window||window.isDestroyed())return;window.setBounds(selectionBounds(snapshot.point,screen.getDisplayNearestPoint(snapshot.point).workArea,panelWidth));snapshot.keyboard?(window.show(),window.focus()):window.showInactive();window.webContents.send('clipper:selection-changed');};if(window.webContents.isLoading())window.webContents.once('did-finish-load',show);else show();
 }
 view():SelectionView|null{const s=this.snapshot;if(!s||!this.valid(s))return null;return {token:s.token,preview:s.text.replace(/\s+/g,' ').slice(0,100),characters:s.text.length,source:s.target.name,dark:this.ctx.dark(),keyboard:s.keyboard};}
 hide(){this.clear();}
 takeInput(){const result=this.pending;this.pending=undefined;return result||null;}
 async action(token:unknown,action:unknown){const snapshot=this.snapshot;if(typeof token!=='string'||!snapshot||snapshot.token!==token||!this.valid(snapshot))throw new Error(tr('选区已失效，请重新选择'));if(!['copy','save','translate','summarize','script','exclude'].includes(String(action)))throw new Error(tr('划词操作无效'));if(this.busy)throw new Error(tr('正在处理选中文字'));
  if(action==='exclude'){this.configure(validateSelection({...this.options,excludedApps:[...this.options.excludedApps,snapshot.target.name]}));return;}
  this.busy=true;const generation=this.generation;
  try{const result=await this.reader.read(this.request(snapshot.target,snapshot.readPoint,snapshot.keyboard));if(generation!==this.generation||!this.valid(snapshot)||!this.allowed(snapshot.target)||result.status!=='ok'||result.text!==snapshot.text)throw new Error(tr('选区已改变，请重新选择文字'));
   if(action==='copy'||action==='save'){await this.ctx.commit(action,snapshot.text,snapshot.target.name,()=>generation===this.generation&&this.valid(snapshot)&&this.allowed(snapshot.target));if(generation===this.generation)this.clear();return;}
   if(this.pending)throw new Error(tr('请先完成待处理的选中文字'));this.pending={text:snapshot.text,action:action as SelectionInput['action']};this.clear();this.ctx.show();this.ctx.changed();
  }catch(e){if(generation===this.generation){this.clear();this.ctx.show();this.ctx.notice(String((e as Error).message));}throw e;}finally{this.busy=false;}
 }
 private tick(){if(this.disposed)return;try{const buttons=mouseButtons(),escape=selectionKeyDown(true),point=screen.getCursorScreenPoint();if(this.ctx.blocked()||!nativeAvailable()){if(this.snapshot||this.reading)this.clear();this.previousLeft=buttons.left;return;}if(escape&&!this.previousEscape)this.clear();this.previousEscape=escape;
   if(this.snapshot&&!this.valid(this.snapshot))this.clear();const inside=!!this.window?.isVisible()&&contains(this.window.getBounds(),point);if((this.snapshot||this.reading)&&Date.now()>this.ignoreKeysUntil&&!this.window?.isFocused()&&selectionKeyDown(false))this.clear();
   if(buttons.left&&!this.previousLeft&&!inside)this.clear();
   if(!buttons.left&&this.previousLeft&&!inside&&this.options.enabled&&!this.ctx.store().settings.paused&&!buttons.right){const target=foreground();if(this.allowed(target)){clearTimeout(this.delay);const generation=this.generation;this.delay=setTimeout(()=>{if(generation===this.generation)void this.read();},this.options.delayMs);}}
   this.previousLeft=buttons.left;
  }catch{if(this.snapshot||this.reading)this.clear();}}
 dispose(){if(this.disposed)return;this.disposed=true;clearInterval(this.timer);this.clear();this.pending=undefined;this.window?.destroy();this.window=undefined;}
}
