import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {join} from 'node:path';
import type {BrowserWindow} from 'electron';
import {t as tr} from '../shared/i18n';
import type {ShortcutInput} from '../shared/shortcut';

export class ShortcutRecorder {
 private child?:ChildProcessWithoutNullStreams;
 async start(window:BrowserWindow,input:(value:ShortcutInput)=>void,closed:()=>void){
  await this.stop();
  const child=spawn(join(__dirname,'../native/ShortcutHost.exe').replace('app.asar','app.asar.unpacked'),[window.getNativeWindowHandle().readBigUInt64LE().toString(),String(process.pid)],{windowsHide:true,stdio:'pipe'});
  this.child=child;
  await new Promise<void>((resolve,reject)=>{
   let buffer='',ready=false;
   const timer=setTimeout(()=>fail(),3000);
   const fail=()=>{clearTimeout(timer);if(!ready)reject(new Error(tr('快捷键录入启动失败，请重试')));};
   child.on('error',fail);child.stdin.on('error',fail);child.stderr.resume();
   child.on('close',()=>{fail();if(this.child===child){this.child=undefined;if(ready)closed();}});
   child.stdout.setEncoding('utf8');child.stdout.on('data',data=>{
    if(this.child!==child)return;buffer+=data;if(buffer.length>8192){child.kill();fail();return;}
    let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);
     if(line==='ready'){ready=true;clearTimeout(timer);resolve();continue;}
     try{const value=JSON.parse(line) as ShortcutInput;if(ready&&['keyDown','keyUp'].includes(value.type)&&typeof value.key==='string'&&typeof value.code==='string'&&['control','alt','shift','meta'].every(key=>typeof value[key as keyof ShortcutInput]==='boolean'))input(value);}catch{}
    }
   });
  });
 }
 async stop(){
  const child=this.child;if(!child)return;this.child=undefined;
  await new Promise<void>(resolve=>{
   const timer=setTimeout(()=>{child.kill();resolve();},500);
   child.once('close',()=>{clearTimeout(timer);resolve();});
   child.stdin.end('stop\n');
  });
 }
}
