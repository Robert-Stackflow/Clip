import {t as tr} from '../shared/i18n';
import type {Detail,ImageHostInput,ImageHostResult,ImageHostState} from '../shared/types';
import type {Store} from './store';
import {createHash} from 'node:crypto';

export interface ImageHostOptions extends ImageHostInput {token:string}
type Options=ImageHostOptions;
export interface UploadControl {signal?:AbortSignal;valid?:()=>boolean;phase?:(message:string)=>void}
export interface UploadRecord {link:string;at:number;checkedAt:number}
const defaults:Options={enabled:false,endpoint:'',token:'',bodyMode:'binary',fieldName:'file',authMode:'bearer',tokenHeader:'X-API-Key',responsePath:'url',linkFormat:'url',timeoutSeconds:30};
const testPng='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function validEndpoint(value:string){if(!value)return '';let url:URL;try{url=new URL(value);}catch{throw new Error(tr('图片上传地址无效'));}if(url.protocol!=='https:'||url.username||url.password||url.hash||url.href.length>2048)throw new Error(tr('图片上传地址需使用 HTTPS'));return url.href;}
function current(store:Store):Options{return {...defaults,...store.meta('image-host',{})};}
function validate(store:Store,input:unknown):Options{
 const value=input as Partial<ImageHostInput>,previous=current(store);
 if(!value||typeof value.enabled!=='boolean'||typeof value.endpoint!=='string'||!['binary','multipart'].includes(String(value.bodyMode))||!['none','bearer','header'].includes(String(value.authMode))||!['url','markdown','html'].includes(String(value.linkFormat))||typeof value.fieldName!=='string'||typeof value.tokenHeader!=='string'||typeof value.responsePath!=='string'||!Number.isInteger(value.timeoutSeconds)||value.timeoutSeconds!<5||value.timeoutSeconds!>120||value.token!==undefined&&(typeof value.token!=='string'||value.token.length>512||/[\r\n]/.test(value.token)))throw new Error(tr('图片上传设置无效'));
 const endpoint=validEndpoint(value.endpoint.trim()),fieldName=value.fieldName.trim(),tokenHeader=value.tokenHeader.trim(),responsePath=value.responsePath.trim();
 if(value.enabled&&!endpoint)throw new Error(tr('请填写图片上传地址'));if(value.bodyMode==='multipart'&&!/^[A-Za-z0-9_.-]{1,64}$/.test(fieldName))throw new Error(tr('文件字段名称无效'));if(value.authMode==='header'&&!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,64}$/.test(tokenHeader))throw new Error(tr('令牌请求头名称无效'));if(!/^[A-Za-z_$][\w$-]*(?:\.[A-Za-z_$][\w$-]*){0,7}$/.test(responsePath))throw new Error(tr('响应链接字段路径无效'));
 const token=value.token===undefined&&endpoint===previous.endpoint?previous.token:value.token||'';
 return {enabled:value.enabled,endpoint,token,bodyMode:value.bodyMode!,fieldName:fieldName||defaults.fieldName,authMode:value.authMode!,tokenHeader:tokenHeader||defaults.tokenHeader,responsePath,linkFormat:value.linkFormat!,timeoutSeconds:value.timeoutSeconds!};
}
function result(store:Store,value:ImageHostResult,options:Options){store.setMeta('image-host-result',value);if(value.kind==='test'){store.setMeta('image-host-test-result',value);store.setMeta('image-host-result-scope',uploadScope(options));}}
function errorMessage(error:unknown){return (error instanceof Error?error.message:String(error)).slice(0,300);}
function responseLink(parsed:any,path:string){let value=parsed;for(const part of path.split('.'))value=value?.[part];if(typeof value==='string')return value;if(path==='url')return parsed?.link??parsed?.data?.link??parsed?.data?.url;return undefined;}
async function send(store:Store,options:Options,png:string,kind:'test'|'upload',request:typeof fetch,control:UploadControl={}){
 const valid=()=>!control.signal?.aborted&&(!control.valid||control.valid());
 try{
  control.signal?.throwIfAborted();
  const headers:Record<string,string>={};if(options.authMode==='bearer'&&options.token)headers.authorization='Bearer '+options.token;else if(options.authMode==='header'&&options.token)headers[options.tokenHeader]=options.token;
  let body:BodyInit;if(options.bodyMode==='multipart'){const form=new FormData();form.append(options.fieldName,new Blob([Buffer.from(png,'base64')],{type:'image/png'}),'clipper.png');body=form;}else{headers['content-type']='image/png';body=Buffer.from(png,'base64');}
  const timeout=AbortSignal.timeout(options.timeoutSeconds*1000),signal=control.signal?AbortSignal.any([timeout,control.signal]):timeout;
  const response=await request(options.endpoint,{method:'POST',headers,body,redirect:'error',signal});if(!response.ok){await response.body?.cancel();throw new Error(tr('图片上传失败')+` (${response.status})`);}
  const length=Number(response.headers.get('content-length')||0);if(length>8192){await response.body?.cancel();throw new Error(tr('图片上传响应过大'));}const reader=response.body?.getReader();if(!reader)throw new Error(tr('图片上传响应为空'));
  const chunks:Uint8Array[]=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192)throw new Error(tr('图片上传响应过大'));chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  const bodyText=new TextDecoder().decode(Buffer.concat(chunks));let parsed:any;try{parsed=JSON.parse(bodyText);}catch{throw new Error(tr('图片上传响应不是 JSON'));}const link=responseLink(parsed,options.responsePath);if(typeof link!=='string'||link.length>2048)throw new Error(tr('图片上传响应缺少链接'));let url:URL;try{url=new URL(link);}catch{throw new Error(tr('图片上传链接无效'));}if(url.protocol!=='https:'||url.username||url.password)throw new Error(tr('图片上传链接需使用 HTTPS'));if(!valid())throw new Error(tr('记录或会话已改变'));result(store,{at:Date.now(),ok:true,kind,message:tr('连接正常'),link:url.href},options);return url.href;
 }catch(error){if(valid())result(store,{at:Date.now(),ok:false,kind,message:errorMessage(error)},options);throw error;}
}

export function imageHostState(store:Store):ImageHostState{const options=current(store),lastResult=store.meta('image-host-result',undefined),scope=store.meta('image-host-result-scope',''),lastTest=scope===uploadScope(options)?store.meta('image-host-test-result',undefined):!scope&&lastResult?.kind==='test'?lastResult:undefined;return {enabled:options.enabled,endpoint:options.endpoint,hasToken:!!options.token,bodyMode:options.bodyMode,fieldName:options.fieldName,authMode:options.authMode,tokenHeader:options.tokenHeader,responsePath:options.responsePath,linkFormat:options.linkFormat,timeoutSeconds:options.timeoutSeconds,...(lastResult?{lastResult}:{}),...(lastTest?{lastTest}:{})};}
export function configureImageHost(store:Store,input:unknown){const previous=current(store),options=validate(store,input);store.setMeta('image-host',options);if(uploadScope(previous)!==uploadScope(options)&&store.meta('image-host-result-scope','')!==uploadScope(options))store.setMeta('image-host-result',null);}
export async function testImageHost(store:Store,input:unknown,request:typeof fetch=fetch,control:UploadControl={}){const options=validate(store,input);if(!options.endpoint)throw new Error(tr('请填写图片上传地址'));const link=await send(store,options,testPng,'test',request,control);store.setMeta('image-host-result-scope',uploadScope(options));return link;}
export async function uploadImage(store:Store,item:Detail,request:typeof fetch=fetch):Promise<string>{const options=current(store);if(!options.enabled||!options.endpoint)throw new Error(tr('请先在设置中启用图片上传'));if(!item.payload.png)throw new Error(tr('请选择 PNG 图片记录'));return send(store,options,item.payload.png,'upload',request);}
export function formatImageHostLink(state:Pick<ImageHostState,'linkFormat'>,link:string){if(state.linkFormat==='markdown')return `![图片](${link})`;if(state.linkFormat==='html')return `<img src="${link}" alt="图片">`;return link;}

export function uploadOptions(store:Store):ImageHostOptions{return {...current(store)};}
function uploadScope(options:Options){return createHash('sha256').update(JSON.stringify([options.endpoint,options.bodyMode,options.fieldName,options.authMode,options.tokenHeader,options.token,options.responsePath])).digest('hex');}
export function uploadKey(options:Options,png:string){return uploadScope(options)+':'+createHash('sha256').update(Buffer.from(png,'base64')).digest('hex');}
function uploadTable(store:Store){store.db.exec('CREATE TABLE IF NOT EXISTS image_uploads (key TEXT PRIMARY KEY, link TEXT NOT NULL, at INTEGER NOT NULL, checkedAt INTEGER NOT NULL)');}
export function imageUploadRecord(store:Store,item:Detail,options=current(store)):UploadRecord|null{if(!item.payload.png)return null;uploadTable(store);return store.db.prepare('SELECT link, at, checkedAt FROM image_uploads WHERE key=?').get(uploadKey(options,item.payload.png)) as UploadRecord||null;}

/** A missing object is different from a network error or an access restriction. */
async function linkExists(link:string,request:typeof fetch,signal:AbortSignal):Promise<boolean>{
 let url=link,method='HEAD';
 for(let redirect=0;redirect<5;redirect++){
  const response=await request(url,{method,headers:method==='GET'?{range:'bytes=0-0'}:undefined,redirect:'manual',signal});
  await response.body?.cancel();
  if(response.status===404||response.status===410)return false;
  if(response.status===405||response.status===501){if(method==='HEAD'){method='GET';redirect--;continue;}}
  if([301,302,303,307,308].includes(response.status)){
   const location=response.headers.get('location');if(!location)throw new Error(tr('图片链接无法验证'));
   const next=new URL(location,url);if(next.protocol!=='https:'||next.username||next.password)throw new Error(tr('图片链接需使用 HTTPS'));url=next.href;continue;
  }
  if(response.ok||response.status===304)return true;
  throw new Error(tr('无法确认图片链接是否有效，请稍后重试或重新上传')+` (${response.status})`);
 }
 throw new Error(tr('图片链接重定向次数过多'));
}
export async function resolveImageUpload(store:Store,item:Detail,options:Options,force=false,control:UploadControl={},request:typeof fetch=fetch):Promise<{link:string;reused:boolean}>{
 if(!options.enabled||!options.endpoint)throw new Error(tr('请先在设置中启用图片上传'));
 if(!item.payload.png)throw new Error(tr('请选择 PNG 图片记录'));
 const valid=()=>!control.signal?.aborted&&(!control.valid||control.valid());
 const ensure=()=>{control.signal?.throwIfAborted();if(!valid())throw new Error(tr('记录或会话已改变'));};
 ensure();const cached=imageUploadRecord(store,item,options),key=uploadKey(options,item.payload.png);
 if(cached&&!force){
  control.phase?.(tr('检查已上传的链接'));
  const timeout=AbortSignal.timeout(Math.min(options.timeoutSeconds,12)*1000),signal=control.signal?AbortSignal.any([timeout,control.signal]):timeout;
  let exists:boolean;try{exists=await linkExists(cached.link,request,signal);}catch(error){ensure();throw new Error(error instanceof Error&&error.message.includes(' (')?error.message:tr('链接检查失败，未重复上传。可重试检查或选择重新上传。'));}
  ensure();if(exists){store.db.prepare('UPDATE image_uploads SET checkedAt=? WHERE key=?').run(Date.now(),key);return {link:cached.link,reused:true};}
  store.db.prepare('DELETE FROM image_uploads WHERE key=?').run(key);control.phase?.(tr('原链接已失效，正在重新上传'));
 }else control.phase?.(tr('正在上传图片'));
 const link=await send(store,options,item.payload.png,'upload',request,control);ensure();
 const at=Date.now();store.db.prepare('INSERT OR REPLACE INTO image_uploads (key,link,at,checkedAt) VALUES (?,?,?,?)').run(key,link,at,at);
 return {link,reused:false};
}
