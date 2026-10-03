import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {join} from 'node:path';
import {t} from '../shared/i18n';
import type {Payload} from '../shared/types';
import {pngDimensions} from './png-header';
import {limitChildProcess} from './native';
interface Job {png:string|Buffer;jpeg:boolean;valid:()=>boolean;resolve:(value:string)=>void;reject:(error:Error)=>void;cancel:()=>void;stopped:Promise<void>;release:()=>void;deadline:number;cancelled?:boolean;child?:ChildProcessWithoutNullStreams}
/** One short-lived native decoder; pending jobs retain references, never full decoded bitmaps. */
export class Thumbnails {
 private jobs:Job[]=[];private active?:Job;private cache=new WeakMap<Payload,{png:string;url:string}>();
 constructor(private executable=join(__dirname,'../native/ImageHost.exe'),private timeout=15000){}
 stats(){return {active:Number(!!this.active),pending:this.jobs.filter(job=>job!==this.active).length,encodedBytes:this.jobs.reduce((n,j)=>n+j.png.length,0)};}
 async stop(){this.cache=new WeakMap();const jobs=[...this.jobs];for(const job of jobs)job.cancel();await Promise.all(jobs.map(job=>job.stopped));}
 run(payload:Payload,valid:()=>boolean=()=>true):Promise<string|undefined>{
  if(!payload.png)return Promise.resolve(undefined);const live=()=>{try{return valid();}catch{return false;}};
  if(!live())return Promise.reject(new Error(t('记录已取消')));const cached=this.cache.get(payload);if(cached?.png===payload.png)return Promise.resolve(cached.url);
  try{pngDimensions(payload.png);}catch(error){return Promise.reject(error);}
  const original=payload.png;return this.submit(original,false,live,value=>{if(live()&&payload.png===original)this.cache.set(payload,{png:original,url:value});});
 }
 convertJPEG(bytes:Buffer,valid:()=>boolean=()=>true):Promise<string>{
  if(!bytes.length||bytes.length>16*1024*1024)return Promise.reject(new Error(t('图片文件过大')));
  const live=()=>{try{return valid();}catch{return false;}};if(!live())return Promise.reject(new Error(t('记录已取消')));
  return this.submit(bytes,true,live);
 }
 private submit(input:string|Buffer,jpeg:boolean,live:()=>boolean,accept?:(value:string)=>void):Promise<string>{
  if(this.jobs.length>=4||this.stats().encodedBytes+input.length>64*1024*1024)return Promise.reject(new Error(t('正在保存剪贴板，请稍后')));
  return new Promise((resolve,reject)=>{let release!:()=>void;const stopped=new Promise<void>(r=>release=r),job:Job={png:input,jpeg,valid:live,resolve:value=>{accept?.(value);resolve(value);},reject,cancel:()=>{},stopped,release,deadline:Date.now()+this.timeout};
   const monitor=setInterval(()=>{if(!live()||Date.now()>job.deadline)job.cancel();},10);monitor.unref();job.cancel=()=>{if(!this.jobs.includes(job))return;job.cancelled=true;if(job.child){job.child.kill();}else{clearInterval(monitor);this.retire(job,new Error(t('记录已取消')));}};
   this.jobs.push(job);void stopped.then(()=>clearInterval(monitor));this.next();
  });
 }
 private retire(job:Job,error?:Error,value?:string){if(!this.jobs.includes(job))return;this.jobs.splice(this.jobs.indexOf(job),1);if(this.active===job)this.active=undefined;job.png='';job.release();if(error||!job.valid())job.reject(error||new Error(t('记录已取消')));else job.resolve(value!);this.next();}
 private next(){if(this.active||!this.jobs.length)return;const job=this.jobs[0];if(!job.valid()){this.retire(job,new Error(t('记录已取消')));return;}this.active=job;
  let child:ChildProcessWithoutNullStreams;try{child=job.child=spawn(this.executable,job.jpeg?['--jpeg']:[],{windowsHide:true,stdio:['pipe','pipe','pipe']});}catch(error){this.retire(job,error as Error);return;}let error:Error|undefined,releaseLimit:(()=>void)|undefined;const chunks:Buffer[]=[];let bytes=0;
  child.once('spawn',()=>{try{releaseLimit=limitChildProcess(child.pid!,384);}catch(e){error=e as Error;child.kill();}});child.once('error',e=>{error=e;});child.stdin.on('error',e=>{error=e;child.kill();});child.stderr.on('data',()=>{});
  child.stdout.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>(job.jpeg?16*1024*1024:1024*1024)){chunk.fill(0);error=new Error(t('图片无法解码'));child.kill();}else chunks.push(chunk);});
  child.once('close',code=>{releaseLimit?.();try{if(job.cancelled)throw new Error(t('记录已取消'));if(error||code!==0||!job.valid()||Date.now()>job.deadline)throw error||new Error(t(code===0?'记录已取消':'图片无法解码'));const output=Buffer.concat(chunks);try{const png=output.toString('base64'),size=pngDimensions(png);if(!job.jpeg){const original=pngDimensions(job.png as string),scale=Math.min(1,280/original.width,180/original.height);if(size.width!==Math.max(1,Math.round(original.width*scale))||size.height!==Math.max(1,Math.round(original.height*scale)))throw new Error(t('PNG 图片无效'));}this.retire(job,undefined,job.jpeg?png:'data:image/png;base64,'+png);}finally{output.fill(0);}}catch(e){this.retire(job,e as Error);}finally{for(const chunk of chunks)chunk.fill(0);}});
  void (async()=>{try{for(let at=0;at<job.png.length;at+=196608){if(!job.valid()||Date.now()>job.deadline)throw new Error(t('记录已取消'));const block=typeof job.png==='string'?Buffer.from(job.png.slice(at,at+196608),'base64'):job.png.subarray(at,at+196608);await new Promise<void>((resolve,reject)=>child.stdin.write(block,e=>{if(!job.jpeg)block.fill(0);e?reject(e):resolve();}));await new Promise<void>(resolve=>setImmediate(resolve));}child.stdin.end();}catch(e){error=e as Error;child.kill();}})();
 }
}
