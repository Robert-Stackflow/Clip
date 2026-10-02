import {t as tr} from '../shared/i18n';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {validateSelectionRead,type SelectionRead,type SelectionRequest} from '../shared/selection';
interface Pending {id:string;resolve:(result:SelectionRead)=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout}
export class SelectionReader {
 private child?:ChildProcessWithoutNullStreams;private pending?:Pending;private buffer='';private idle?:NodeJS.Timeout;
 constructor(private executable:string,private args:string[]=[],private timeout=2200){}
 private start(){if(this.child)return this.child;const child=spawn(this.executable,this.args,{windowsHide:true,stdio:'pipe'});this.child=child;this.buffer='';
  child.stdout.setEncoding('utf8');child.stdout.on('data',(chunk:string)=>{if(this.child!==child)return;this.buffer+=chunk;if(Buffer.byteLength(this.buffer)>512*1024){this.cancel(tr('选区接口输出超过限制'));return;}const end=this.buffer.indexOf('\n');if(end<0)return;const line=this.buffer.slice(0,end);this.buffer=this.buffer.slice(end+1);const pending=this.pending;if(!pending)return;try{const value=validateSelectionRead(JSON.parse(line),pending.id);clearTimeout(pending.timer);this.pending=undefined;pending.resolve(value);}catch(e){this.cancel((e as Error).message);}});
  child.stderr.resume();child.on('error',()=>{if(this.child===child)this.cancel(tr('Windows 选区接口无法启动'));});child.on('exit',()=>{if(this.child===child)this.cancel(tr('Windows 选区接口已退出'));});child.stdin.on('error',()=>{if(this.child===child)this.cancel(tr('Windows 选区接口已中断'));});return child;
 }
 read(request:SelectionRequest):Promise<SelectionRead>{if(this.pending)this.cancel(tr('选区读取已更新'));clearTimeout(this.idle);const child=this.start();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>this.cancel(tr('目标应用未及时返回选中文字')),this.timeout);this.pending={id:request.id,resolve,reject,timer};child.stdin.write(JSON.stringify(request)+'\n');this.idle=setTimeout(()=>this.cancel(),60000);this.idle.unref();});}
 cancel(reason=tr('选区读取已取消')){clearTimeout(this.idle);const pending=this.pending;this.pending=undefined;if(pending){clearTimeout(pending.timer);pending.reject(new Error(reason));}const child=this.child;this.child=undefined;this.buffer='';if(child){child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();child.kill();}}
 get pid(){return this.child?.pid;}
}
