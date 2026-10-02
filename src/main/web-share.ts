import {publicPNG} from '../shared/formats';
import {createServer,type Server} from 'node:https';
import type {IncomingMessage,ServerResponse} from 'node:http';
import type {Duplex} from 'node:stream';
import {randomBytes,randomInt,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {imageSize} from 'image-size';
import {createSyncIdentity} from './sync-identity';
import {localAddresses} from './sync-discovery';
import {privateAddress,syncName,uuidPattern} from '../shared/sync';
import {validatePayload,MAX_ITEM} from '../shared/core';
import {isInvitation,type WebOptions,type WebState,type WebItem,type WebClientState} from '../shared/web-share';
import type {Detail,Payload} from '../shared/types';
import type {Store} from './store';

interface Client {id:string;token:string;name:string;host:string;code:string;approved:boolean;allowSend:boolean;expires:number;lastSeen:number;reads:number[];writes:number[];stream?:ServerResponse;receipts:Map<string,string>}
interface Entry {clipId:string;hash:string;meta:WebItem}
class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
const secret=()=>randomBytes(32).toString('base64url');
const equal=(a:string,b:unknown)=>typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const securityHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",'Permissions-Policy':'clipboard-read=(), clipboard-write=(self), camera=(), microphone=(), geolocation=()'};

/** Ephemeral browser sessions. No browser credential or shared pool is persisted. */
export class WebShareService {
 private server?:Server;private generation=0;private sockets=new Set<Duplex>();private clients=new Map<string,Client>();private pool=new Map<string,Entry>();private origin='';private fingerprint='';private expires=0;private follow=false;private error='';private invitation?:{token:string;expires:number};private revision=0;private timer?:NodeJS.Timeout;private notification?:NodeJS.Timeout;private ipRates=new Map<string,number[]>();private dirtyPrivacy=new Set<string>();
 constructor(private store:()=>Store,private changed:()=>void,private enqueue:<T>(fn:()=>T|Promise<T>)=>Promise<T>,private thumbnail:(p:Payload)=>string|undefined,private assets:string,private options:{addresses?:()=>string[];now?:()=>number;publicImage?:(png:string)=>Buffer}={}){}
 private now(){return this.options.now?.()??Date.now();}
 private addresses(){return this.options.addresses?.()??localAddresses();}
 state():WebState {this.expire();this.reconcile();return {running:!!this.server,addresses:this.addresses(),origin:this.origin,invitation:this.invitation?this.origin+'/#clipper-web='+this.invitation.token:'',inviteExpires:this.invitation?.expires||0,expires:this.expires,fingerprint:this.fingerprint,follow:this.follow,error:this.error,items:[...this.pool.values()].map(e=>({...e.meta,clipId:e.clipId})),clients:[...this.clients.values()].map(({id,name,host,code,approved,allowSend})=>({id,name,host,code,approved,allowSend}))};}
 async start(value:WebOptions){
  if(!value||!privateAddress(value.host)||!this.addresses().includes(value.host)||!Number.isInteger(value.minutes)||value.minutes<5||value.minutes>120||typeof value.follow!=='boolean')throw new Error('请选择本机地址与 5–120 分钟的时长');
  if(this.server)throw new Error('请先结束当前共享');const generation=++this.generation,identity=await createSyncIdentity(value.host);if(generation!==this.generation)throw new Error('开启共享已取消');
  const server=createServer({key:identity.key,cert:identity.cert,minVersion:'TLSv1.2',handshakeTimeout:5000},(req,res)=>{void this.receive(req,res).catch(e=>{if(res.headersSent){res.destroy();return;}this.json(res,{error:e instanceof HttpError?e.message:'内容无效或无法保存'},e instanceof HttpError?e.status:400);});});
  server.maxConnections=32;server.requestTimeout=15000;server.headersTimeout=5000;server.keepAliveTimeout=3000;server.maxHeadersCount=40;server.on('connection',socket=>{this.sockets.add(socket);socket.once('close',()=>this.sockets.delete(socket));});server.on('secureConnection',socket=>socket.disableRenegotiation());
  try{await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,value.host,()=>{server.removeListener('error',reject);resolve();});});}catch(e){server.close();throw e;}
  if(generation!==this.generation){server.close();throw new Error('开启共享已取消');}
  this.server=server;this.origin=`https://${value.host}:${(server.address() as {port:number}).port}`;this.fingerprint=identity.fingerprint;this.expires=this.now()+value.minutes*60000;this.follow=value.follow;this.error='';
  server.on('error',()=>{this.error='网页服务遇到网络错误，请重新开启';void this.stop();});this.timer=setInterval(()=>{this.expire();for(const c of this.clients.values())if(c.stream){if(!c.stream.write(': keepalive\n\n'))c.stream.destroy();else c.lastSeen=this.now();}},15000);this.invite();
 }
 async stop(){this.generation++;clearInterval(this.timer);clearTimeout(this.notification);this.notification=undefined;const server=this.server;this.server=undefined;for(const c of this.clients.values())c.stream?.end('event: closed\ndata: {}\n\n');this.clients.clear();this.pool.clear();this.ipRates.clear();this.dirtyPrivacy.clear();this.invitation=undefined;this.origin='';this.fingerprint='';this.expires=0;this.follow=false;this.changed();if(server)await new Promise<void>(resolve=>{server.close(()=>resolve());for(const s of this.sockets)s.destroy();this.sockets.clear();});}
 invite(){this.ensureRunning();this.invitation={token:secret(),expires:Math.min(this.expires,this.now()+300000)};this.notify();return this.state().invitation;}
 setFollow(value:boolean){this.ensureRunning();if(typeof value!=='boolean')throw new Error('共享选项无效');this.follow=value;this.notify();}
 approve(id:string,accept:boolean,allowSend:boolean){this.expire();const c=this.clients.get(id);if(!c||c.approved||typeof accept!=='boolean'||typeof allowSend!=='boolean')throw new Error('连接请求已失效');if(!accept){this.revoke(id);return;}if([...this.clients.values()].filter(c=>c.approved).length>=4)throw new Error('最多允许 4 个浏览器');c.approved=true;c.allowSend=allowSend;c.expires=this.expires;this.notify();}
 revoke(id:string){const c=this.clients.get(id);if(c){c.stream?.end('event: closed\ndata: {}\n\n');this.clients.delete(id);this.notify();}}
 publish(id:string){this.ensureRunning();const item=this.store().get(id);if(!this.eligible(item))throw new Error('仅支持可共享的文字和图片，邀请、文件及仅本机内容不能共享');if([...this.pool.values()].some(e=>e.clipId===id&&e.hash===item.hash))return;if(this.pool.size>=100)throw new Error('一次最多共享 100 项，请先撤回部分内容');const webId=randomUUID();this.pool.set(webId,{clipId:id,hash:item.hash,meta:{id:webId,title:item.title,preview:item.payload.png?'PNG 图片':(item.payload.text||'').slice(0,240),image:!!item.payload.png,bytes:item.bytes}});this.notify();}
 remove(id:string){if(this.pool.delete(id))this.notify();}
 capture(item:Detail){if(this.server&&this.follow&&this.pool.size<100&&this.eligible(item))this.publish(item.id);}
 private eligible(item:Detail){return !item.localOnly&&!item.payload.files&&!item.payload.attachments&&!!(item.payload.text||item.payload.png)&&!isInvitation(item.payload.text||'');}
 observe(previous:Detail|undefined,next?:Detail){if(!this.pool.size)return;if(previous?.localOnly!==next?.localOnly)this.dirtyPrivacy.add((next||previous)!.id);queueMicrotask(()=>{if(this.server)this.reconcile();});}
 reconcile(){if(!this.pool.size)return;const ids=[...this.pool.values()].map(e=>e.clipId),rows=this.store().db.prepare(`SELECT id,hash FROM clips WHERE id IN (${ids.map(()=>'?').join(',')})`).all(...ids) as {id:string;hash:string}[],known=new Map(rows.map(r=>[r.id,r.hash]));let changed=false;
  for(const [id,e] of this.pool){if(known.get(e.clipId)!==e.hash||this.dirtyPrivacy.has(e.clipId)&&!this.eligible(this.store().get(e.clipId))){this.pool.delete(id);changed=true;}}this.dirtyPrivacy.clear();if(changed)this.notify();
 }
 private notify(){this.revision++;if(this.notification)return;this.notification=setTimeout(()=>{this.notification=undefined;for(const c of this.clients.values())if(c.stream&&!c.stream.write(`event: changed\ndata: ${this.revision}\n\n`))c.stream.destroy();this.changed();},150);}
 private expire(){const now=this.now();if(this.server&&this.expires<=now){void this.stop();return;}if(this.invitation&&this.invitation.expires<=now){this.invitation=undefined;this.notify();}for(const c of this.clients.values())if(c.expires<=now||!c.stream&&c.lastSeen+90000<now&&c.approved)this.revoke(c.id);}
 private ensureRunning(){this.expire();if(!this.server)throw new HttpError(410,'共享已结束，请重新请求邀请');}
 private json(res:ServerResponse,value:unknown,status=200){res.writeHead(status,{...securityHeaders,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
 private limit(times:number[],count:number,period:number){const now=this.now();while(times.length&&times[0]<=now-period)times.shift();if(times.length>=count)throw new HttpError(429,'请求过于频繁，请稍后重试');times.push(now);}
 private async body(req:IncomingMessage,max:number){if(req.headers['content-type']!=='application/json')throw new HttpError(415,'请发送 JSON 内容');if(req.headers['content-encoding'])throw new HttpError(415,'不支持压缩请求');if(Number(req.headers['content-length']||0)>max)throw new HttpError(413,'内容过大');let length=0;const chunks:Buffer[]=[];for await(const chunk of req){length+=chunk.length;if(length>max)throw new HttpError(413,'内容过大');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new HttpError(400,'内容格式无效');}}
 private authorized(req:IncomingMessage){this.ensureRunning();const token=req.headers.authorization?.replace(/^Bearer /,'');const c=[...this.clients.values()].find(c=>equal(c.token,token));if(!c)throw new HttpError(403,'连接已失效，请在桌面端重新生成邀请');c.lastSeen=this.now();return c;}
 private async receive(req:IncomingMessage,res:ServerResponse){
  this.ensureRunning();const host=(req.socket.remoteAddress||'').replace(/^::ffff:/,'');if(!privateAddress(host)||req.headers.host!==this.origin.slice(8)||req.headers.origin&&req.headers.origin!==this.origin||req.headers['sec-fetch-site']==='cross-site')throw new HttpError(403,'请求来源不受支持');if(req.method==='POST'&&req.headers.origin!==this.origin)throw new HttpError(403,'请求来源不受支持');const generation=this.generation;
  if(req.method==='GET'&&['/','/app.js','/app.css'].includes(req.url||'')){const file=req.url==='/'?'index.html':req.url!.slice(1);res.writeHead(200,{...securityHeaders,'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'});res.end(readFileSync(join(this.assets,file)));return;}
  if(req.method==='POST'&&req.url==='/api/connect'){
   let times=this.ipRates.get(host);if(!times){if(this.ipRates.size>=128)throw new HttpError(429,'连接请求过多');this.ipRates.set(host,times=[]);}this.limit(times,10,60000);if([...this.clients.values()].filter(c=>!c.approved).length>=8)throw new HttpError(429,'待确认请求过多');const b=await this.body(req,4096);this.ensureRunning();if(generation!==this.generation)throw new HttpError(410,'会话已改变');if(!this.invitation||!equal(this.invitation.token,b?.invite)||b?.verified!==true)throw new HttpError(403,'邀请无效、已使用或未核对证书');const name=syncName(b.name);this.invitation=undefined;const c:Client={id:randomUUID(),token:secret(),name,host,code:String(randomInt(100000,1000000)),approved:false,allowSend:false,expires:Math.min(this.expires,this.now()+300000),lastSeen:this.now(),reads:[],writes:[],receipts:new Map()};this.clients.set(c.id,c);this.notify();this.json(res,{token:c.token,code:c.code});return;
  }
  const c=this.authorized(req);this.limit(c.reads,30,1000);if(req.method==='GET'&&req.url==='/api/state'){this.reconcile();const state:WebClientState={approved:c.approved,name:c.name,code:c.code,allowSend:c.allowSend,expires:c.expires,revision:this.revision,items:c.approved?[...this.pool.values()].map(e=>e.meta):[]};this.json(res,state);return;}
  if(!c.approved)throw new HttpError(403,'等待桌面端确认连接');
  if(req.method==='GET'&&req.url==='/api/events'){c.stream?.destroy();res.writeHead(200,{...securityHeaders,'Content-Type':'text/event-stream; charset=utf-8','Connection':'keep-alive'});res.write(`event: changed\ndata: ${this.revision}\n\n`);c.stream=res;req.socket.setTimeout(0);res.once('close',()=>{if(c.stream===res){c.stream=undefined;c.lastSeen=this.now();}});return;}
  if(req.method==='GET'&&req.url?.startsWith('/api/item/')){const e=this.pool.get(req.url.slice(10));if(!e)throw new HttpError(404,'该内容已撤回');const item=this.store().find(e.clipId);if(!item||item.hash!==e.hash||!this.eligible(item)){this.pool.delete(e.meta.id);this.notify();throw new HttpError(404,'该内容已撤回');}if(item.payload.png){res.writeHead(200,{...securityHeaders,'Content-Type':'image/png','Content-Disposition':'attachment; filename="Clipper.png"'});res.end(this.options.publicImage?.(item.payload.png)||publicPNG(Buffer.from(item.payload.png,'base64')));}else this.json(res,{text:item.payload.text});return;}
  if(req.method==='POST'&&req.url==='/api/send'){
   if(!c.allowSend)throw new HttpError(403,'此浏览器只有接收权限');this.limit(c.writes,10,60000);const b=await this.body(req,MAX_ITEM+1024);if(!b||typeof b.requestId!=='string'||!uuidPattern.test(b.requestId)||!b.payload||Object.keys(b.payload).length!==1||!['text','png'].includes(Object.keys(b.payload)[0]))throw new HttpError(400,'只支持文字或 PNG 图片');const payload=validatePayload(b.payload),hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');let thumb:string|undefined;
   if(payload.png){const size=imageSize(Buffer.from(payload.png,'base64'));if(size.type!=='png'||!size.width||!size.height||size.width>16384||size.height>16384||size.width*size.height>40000000)throw new HttpError(400,'图片尺寸过大或无效');thumb=this.thumbnail(payload);if(!thumb)throw new HttpError(400,'无法读取 PNG 图片');}
   await this.enqueue(()=>{this.ensureRunning();if(generation!==this.generation||this.clients.get(c.id)!==c||!c.allowSend)throw new HttpError(403,'连接或发送权限已失效');const prior=c.receipts.get(b.requestId);if(prior){if(prior!==hash)throw new HttpError(409,'请求编号已用于不同内容');return;}const store=this.store();store.db.exec('SAVEPOINT web_receive');try{const exists=!!store.db.prepare('SELECT id FROM clips WHERE hash=?').get(hash),item=store.add(payload,'网页 · '+c.name,thumb,undefined,false);if(!exists){item.localOnly=true;store.save(item);}store.db.exec('RELEASE web_receive');c.receipts.set(b.requestId,hash);if(c.receipts.size>100)c.receipts.delete(c.receipts.keys().next().value!);}catch(e){store.db.exec('ROLLBACK TO web_receive; RELEASE web_receive');throw e;}store.prune();this.changed();});this.json(res,{ok:true});return;
  }
  throw new HttpError(404,'不支持的操作');
 }
}
