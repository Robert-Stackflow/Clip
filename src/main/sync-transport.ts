import {SyncError,syncRemoteError} from '../shared/sync-errors';
import {t as tr} from '../shared/i18n';
import type {ServerResponse,IncomingMessage} from 'node:http';
import {request as secureRequest} from 'node:https';
import type {TLSSocket} from 'node:tls';
import type {SyncPeer} from '../shared/sync';
import {syncPeer,MAX_SYNC_BODY} from '../shared/sync';
import {certificateFingerprint,type SyncIdentity} from './sync-identity';
export {MAX_SYNC_BODY} from '../shared/sync';
export function remoteAddress(address:string){return address.replace(/^::ffff:/,'');}
export function socketFingerprint(socket:TLSSocket){const raw=socket.getPeerCertificate().raw;if(!raw)throw new SyncError('SYNC_CERTIFICATE_MISSING');return certificateFingerprint(raw);}
export async function readSyncBytes(req:IncomingMessage,limit=MAX_SYNC_BODY){const chunks:Buffer[]=[];let size=0;try{for await(const chunk of req){size+=chunk.length;if(size>limit){chunk.fill(0);throw new SyncError('SYNC_REQUEST_TOO_LARGE');}chunks.push(chunk);}const bytes=Buffer.allocUnsafeSlow(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;}finally{for(const chunk of chunks)chunk.fill(0);}}
export async function readSyncBody(req:IncomingMessage,limit=MAX_SYNC_BODY){const bytes=await readSyncBytes(req,limit);try{return JSON.parse(bytes.toString('utf8'));}finally{bytes.fill(0);}}
export function syncBytesResponse(res:ServerResponse,bytes:Uint8Array,status=200,clear=()=>{bytes.fill(0);}){res.once('close',clear);res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Content-Length':bytes.length,'Connection':'close'});res.end(bytes,clear);}
export function syncResponse(res:ServerResponse,value:unknown,status=200){const bytes=Buffer.from(JSON.stringify(value));res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Content-Length':bytes.length,'Connection':'close'});res.end(bytes);}
export function syncRequest(identity:SyncIdentity,peer:SyncPeer,path:string,body?:unknown,signal?:AbortSignal,payloadVersion=5):Promise<any>{
 syncPeer(peer);if(!path.startsWith('/v1/'))throw new Error(tr('请求路径无效'));const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body));if(bytes&&bytes.length>MAX_SYNC_BODY)throw new Error(tr('同步内容过大'));
 return syncRequestBytes(identity,peer,path,bytes,signal,payloadVersion);
}
export function syncRequestBytes(identity:SyncIdentity,peer:SyncPeer,path:string,bytes:Uint8Array|undefined,signal?:AbortSignal,payloadVersion=5,valid?:()=>boolean,rawResponse=false):Promise<any>{
 syncPeer(peer);if(!path.startsWith('/v1/'))throw new Error(tr('请求路径无效'));if(bytes&&bytes.length>MAX_SYNC_BODY)throw new SyncError('SYNC_REQUEST_TOO_LARGE');
 return new Promise((resolve,reject)=>{
  let finished=false;const req=secureRequest({host:peer.host,port:peer.port,path,method:bytes===undefined?'GET':'POST',key:identity.key,cert:identity.cert,minVersion:'TLSv1.3',maxVersion:'TLSv1.3',rejectUnauthorized:false,agent:false,signal,headers:{'X-Clip-Payload-Version':String(payloadVersion),'Content-Type':'application/json','Content-Length':bytes?.length||0,'Connection':'close'}});
  const timer=setTimeout(()=>req.destroy(new Error(tr('连接超时，请检查两台设备及防火墙'))),10000);const done=(error?:Error,result?:unknown)=>{if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve(result);};
  // No HTTP request/body is released until the out-of-band certificate pin matches.
  req.on('socket',socket=>(socket as TLSSocket).once('secureConnect',()=>{try{if(socketFingerprint(socket as TLSSocket)!==peer.fingerprint)throw new Error(tr('设备证书已改变，已停止发送'));if(valid&&!valid())throw new SyncError('SYNC_SEND_DENIED');req.end(bytes);}catch(e){req.destroy(e as Error);}}));
  req.on('response',res=>{void(async()=>{if(res.statusCode!==200)throw syncRemoteError(await readSyncBody(res,8192));const result=rawResponse?await readSyncBytes(res):await readSyncBody(res);if(finished){if(rawResponse)result.fill(0);return;}done(undefined,result);})().catch(e=>{req.destroy();done(e);});});req.on('error',e=>done(e));
 });
}
