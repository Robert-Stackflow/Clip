import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {join} from 'node:path';
import {t as tr} from '../shared/i18n';
export interface WinVTarget{hwnd:number;pid:number}

/** The helper stays disabled during shortcut recording; its pipe closes on parent exit. */
export class WinVShortcut {
 private child?:ChildProcessWithoutNullStreams;
 private preparing?:Promise<void>;
 private available=false;
 private suspended=false;
 private callback?:(target:WinVTarget)=>void;
 constructor(private failed:(error:Error)=>void=()=>{}){}
 async prepare(){
  if(this.preparing)return this.preparing;if(this.available)return;
  const child=spawn(join(__dirname,'../native/ShortcutHost.exe').replace('app.asar','app.asar.unpacked'),['--win-v',String(process.pid)],{windowsHide:true,stdio:'pipe'});
  this.child=child;
  const startup=new Promise<void>((resolve,reject)=>{
   let buffer='',ready=false,finished=false;
   const fail=()=>{
    if(finished)return;finished=true;clearTimeout(timer);
    const current=this.child===child;if(current){this.child=undefined;this.available=false;}
    const active=current&&!!this.callback;if(current)this.callback=undefined;
    child.kill();const error=new Error(tr('Win+V 拦截启动失败，请关闭其他 Clipper 实例后重试'));
    if(!ready)reject(error);else if(active)this.failed(error);
   };
   const timer=setTimeout(fail,3000);
   child.on('error',fail);child.stdin.on('error',fail);child.on('close',fail);child.stderr.resume();
   child.stdout.setEncoding('utf8');child.stdout.on('data',(data:string)=>{
    if(this.child!==child||finished)return;buffer+=data;if(buffer.length>8192){fail();return;}
    let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);
     if(line==='ready'&&!ready){ready=true;this.available=true;clearTimeout(timer);resolve();}
     else if(ready&&!this.suspended){const event=/^pressed (\d+) (\d+)$/.exec(line);if(event){const hwnd=Number(event[1]),pid=Number(event[2]);if(Number.isSafeInteger(hwnd)&&hwnd>0&&Number.isInteger(pid)&&pid>0)this.callback?.({hwnd,pid});}}
    }
   });
  });
  this.preparing=startup;try{await startup;}finally{if(this.preparing===startup)this.preparing=undefined;}
 }
 register(callback:(target:WinVTarget)=>void){if(!this.available||!this.child)return false;this.callback=callback;this.command(this.suspended?'disable':'enable');return true;}
 unregister(){this.callback=undefined;this.command('disable');}
 suspend(value:boolean){this.suspended=value;this.command(this.callback&&!value?'enable':'disable');}
 private command(value:string){if(this.child&&!this.child.stdin.destroyed)this.child.stdin.write(value+'\n');}
 async stop(){
  const child=this.child;this.unregister();this.child=undefined;this.available=false;if(!child)return;
  await new Promise<void>(resolve=>{
   const timer=setTimeout(()=>{child.kill();resolve();},500);
   child.once('close',()=>{clearTimeout(timer);resolve();});if(!child.stdin.destroyed)child.stdin.end('stop\n');else child.kill();
  });
 }
}
