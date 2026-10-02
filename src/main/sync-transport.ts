import type {ServerResponse,IncomingMessage} from 'node:http';
import {request as secureRequest} from 'node:https';
import type {TLSSocket} from 'node:tls';
import type {SyncPeer} from '../shared/sync';
import {syncPeer} from '../shared/sync';
import {certificateFingerprint,type SyncIdentity} from './sync-identity';
export const MAX_SYNC_BODY=24*1024*1024;
export function remoteAddress(address:string){return address.replace(/^::ffff:/,'');}
export function socketFingerprint(socket:TLSSocket){const raw=socket.getPeerCertificate().raw;if(!raw)throw new Error('设备没有提供证书');return certificateFingerprint(raw);}
export async function readSyncBody(req:IncomingMessage,limit=MAX_SYNC_BODY){const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw new Error('同步请求过大');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
export function syncResponse(res:ServerResponse,value:unknown,status=200){const bytes=Buffer.from(JSON.stringify(value));res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Content-Length':bytes.length,'Connection':'close'});res.end(bytes);}
export function syncRequest(identity:SyncIdentity,peer:SyncPeer,path:string,body?:unknown,signal?:AbortSignal,payloadVersion=4):Promise<any>{
 syncPeer(peer);if(!path.startsWith('/v1/'))throw new Error('请求路径无效');const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body));if(bytes&&bytes.length>MAX_SYNC_BODY)throw new Error('同步内容过大');
 return new Promise((resolve,reject)=>{
  let finished=false;const req=secureRequest({host:peer.host,port:peer.port,path,method:body===undefined?'GET':'POST',key:identity.key,cert:identity.cert,minVersion:'TLSv1.3',maxVersion:'TLSv1.3',rejectUnauthorized:false,agent:false,signal,headers:{'X-Clipper-Payload-Version':String(payloadVersion),'Content-Type':'application/json','Content-Length':bytes?.length||0,'Connection':'close'}});
  const timer=setTimeout(()=>req.destroy(new Error('连接超时，请检查两台设备及防火墙')),10000);const done=(error?:Error,result?:unknown)=>{if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve(result);};
  // No HTTP request/body is released until the out-of-band certificate pin matches.
  req.on('socket',socket=>(socket as TLSSocket).once('secureConnect',()=>{try{if(socketFingerprint(socket as TLSSocket)!==peer.fingerprint)throw new Error('设备证书已改变，已停止发送');req.end(bytes);}catch(e){req.destroy(e as Error);}}));
  req.on('response',res=>{void(async()=>{const result=await readSyncBody(res);if(res.statusCode!==200)throw new Error(typeof result.error==='string'?result.error:'设备拒绝同步');done(undefined,result);})().catch(e=>{req.destroy();done(e);});});req.on('error',e=>done(e));
 });
}
