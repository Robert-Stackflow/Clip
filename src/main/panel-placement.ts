import {app,screen,type Rectangle} from 'electron';
import {execFile} from 'node:child_process';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {anchoredQuickPanelBounds} from '../shared/quick-panel';
import {validRect} from '../shared/desktop';
import {nativeCaretBounds,windowBounds,foreground,type PasteTarget} from './native';
const run=promisify(execFile);
const dip=(rect:Rectangle)=>screen.screenToDipRect(null,{x:Math.round(rect.x),y:Math.round(rect.y),width:Math.max(1,Math.round(rect.width)),height:Math.max(1,Math.round(rect.height))});
export async function panelPlacement(target?:PasteTarget):Promise<Rectangle>{
 const bounds=windowBounds(target?.hwnd||foreground()?.hwnd||0);
 let caret=target?nativeCaretBounds(target.hwnd):undefined;
 if(target&&!caret){
  const helper=app.isPackaged?join(process.resourcesPath,'app.asar.unpacked/dist/native/SourceHost.exe'):join(__dirname,'../native/SourceHost.exe');
  // Chromium can enable accessibility on the first query without returning a
  // caret yet. One bounded retry reads the now-ready provider.
  for(const timeout of [450,200]){try{const {stdout}=await run(helper,['caret',String(target.hwnd),String(target.pid)],{windowsHide:true,timeout,maxBuffer:4096}),value=JSON.parse(stdout);if(value&&validRect(value)&&value.height<512){caret=value;break;}}catch{/* Unsupported or stalled providers use the window anchor. */}}
 }
 const window=bounds?dip(bounds):undefined,insertion=caret?dip(caret):undefined;
 const display=insertion?screen.getDisplayNearestPoint({x:insertion.x,y:insertion.y}):window?screen.getDisplayMatching(window):screen.getPrimaryDisplay();
 return anchoredQuickPanelBounds(display.workArea,window,insertion);
}
