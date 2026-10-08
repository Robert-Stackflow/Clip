import {Worker} from 'node:worker_threads';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {interfaceLanguage,t as tr} from '../shared/i18n';
interface Source {source:string;id:string;snippet:boolean;key():Uint8Array|undefined;valid():boolean}
interface Lease {readers?:number;owner:number;source:Source;job?:{cancel():void};bytes?:Uint8Array;loading?:Promise<Uint8Array|undefined>}
/** One's opaque preview-resource pattern, with encrypted database images kept in memory. */
export class PreviewImages {
 private stopping=new Set<Promise<void>>();private leases=new Map<string,Lease>();private owners=new Map<number,string>();
 constructor(private workerFile=join(__dirname,'preview-image-worker.cjs'),private timeout=15000){}
 register(owner:number,source:Source){this.clear(owner);const token=randomUUID();this.leases.set(token,{owner,source});this.owners.set(owner,token);return 'clip://app/preview-image/'+token;}
 release(url:string,owner:number){const token=this.token(url),lease=token?this.leases.get(token):undefined;if(lease?.owner===owner)this.remove(token!);}
 clear(owner?:number){for(const [token,lease] of this.leases)if(owner===undefined||owner===lease.owner)this.remove(token);}
 stats(){return {leases:this.leases.size,bytes:[...this.leases.values()].reduce((n,l)=>n+(l.bytes?.byteLength||0),0),workers:[...this.leases.values()].filter(l=>!!l.job).length,readers:[...this.leases.values()].reduce((n,l)=>n+(l.readers||0),0)};}
 async stop(){this.clear();await Promise.all([...this.stopping]);}
 private remove(token:string){const lease=this.leases.get(token);if(!lease)return;this.leases.delete(token);if(this.owners.get(lease.owner)===token)this.owners.delete(lease.owner);lease.job?.cancel();lease.bytes?.fill(0);lease.bytes=undefined;}
 private token(url:string){try{const u=new URL(url);return u.host==='app'&&u.protocol==='clip:'&&/^\/preview-image\/[0-9a-f-]{36}$/.test(u.pathname)?u.pathname.slice('/preview-image/'.length):undefined;}catch{return undefined;}}
 private valid(token:string,lease:Lease){try{return this.leases.get(token)===lease&&lease.source.valid();}catch{return false;}}
 private load(token:string,lease:Lease){return lease.loading??=new Promise<Uint8Array|undefined>((resolve,reject)=>{
  if(!this.valid(token,lease)){resolve(undefined);return;}const key=lease.source.key();let worker:Worker;
  try{worker=new Worker(this.workerFile,{workerData:{source:lease.source.source,id:lease.source.id,snippet:lease.source.snippet,key,language:interfaceLanguage()},resourceLimits:{maxOldGenerationSizeMb:96}});}catch(error){key?.fill(0);reject(error);return;}key?.fill(0);
  let done=false;const finish=(error?:Error,bytes?:Uint8Array)=>{if(done){bytes?.fill(0);return;}done=true;clearTimeout(timer);lease.job=undefined;const stopped=worker.terminate().then(()=>{
   if(!this.valid(token,lease)){bytes?.fill(0);resolve(undefined);}else if(error)reject(error);else{lease.bytes=bytes;resolve(bytes);}
  },()=>{bytes?.fill(0);reject(new Error(tr('图片预览已取消')));});this.stopping.add(stopped);void stopped.finally(()=>this.stopping.delete(stopped));};
  lease.job={cancel:()=>finish()};const timer=setTimeout(()=>finish(new Error(tr('图片预览超时，请重试'))),this.timeout);timer.unref();
  worker.once('message',message=>finish(message?.ok?undefined:new Error(message?.error||tr('无法读取图片预览')),message?.bytes));worker.once('error',error=>finish(error));worker.once('exit',()=>finish(new Error(tr('无法读取图片预览'))));
 }).catch(error=>{lease.loading=undefined;throw error;});}
 async response(request:Request){const token=this.token(request.url),lease=token?this.leases.get(token):undefined;if(request.method!=='GET'||!token||!lease||!this.valid(token,lease))return new Response(null,{status:404});try{
  const bytes=lease.bytes||await this.load(token,lease);if(!bytes||!this.valid(token,lease))return new Response(null,{status:404});
  lease.readers=(lease.readers||0)+1;let completed=false;const finishStream=()=>{if(completed)return;completed=true;lease.readers=Math.max(0,(lease.readers||1)-1);if(!lease.readers&&lease.bytes===bytes){bytes.fill(0);lease.bytes=undefined;lease.loading=undefined;}};let offset=0,chunks=0;const stream=new ReadableStream<Uint8Array>({pull:async controller=>{if(!this.valid(token,lease)){finishStream();controller.error(new Error(tr('图片预览已取消')));return;}if(offset===bytes.length){finishStream();controller.close();return;}const next=Math.min(bytes.length,offset+65536);controller.enqueue(bytes.slice(offset,next));offset=next;if(++chunks%4===0)await new Promise<void>(resolve=>setImmediate(resolve));},cancel:()=>finishStream()});return new Response(stream,{headers:{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response(null,{status:404});}}
}
