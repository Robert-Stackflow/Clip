import {t as tr} from '../shared/i18n';
import {safeStorage,app,session} from 'electron';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Store} from './store';
import type {AIModel,AIProfile,AIRequest,AIState} from '../shared/text-tools';
import {validateAIProfile,isLoopback,requestId,aiEndpoint,aiMessages,selectAIModel,type AISelection} from '../shared/text-tools';
import {fetchModels,generateText} from './ai-transport';
import {CommandService} from './commands';
import {commandMessages} from '../shared/commands';
import {CodexProvider,codexExecutables,type CodexBackend} from './codex-provider';
import {streamChat} from './chat-transport';
import type {ChatWireMessage} from '../shared/chat';
interface SavedAI {profiles:AIProfile[];defaultId:string;keys:Record<string,string>}
function localCodex(store:Store){return new CodexProvider(()=>join(app.getPath('userData'),'codex'),()=>codexExecutables({executable:store.meta('codex-executable','')}),()=>session.defaultSession.resolveProxy('https://chatgpt.com/backend-api/codex/responses'));}
export class AIService {
 private active=new Map<string,{profileId:string;controller:AbortController}>();
 readonly commands:CommandService;
 constructor(private store:Store,private codex:CodexBackend=localCodex(store)){this.commands=new CommandService(store);}
 private saved():SavedAI {return this.store.meta('ai-profiles',{profiles:[],defaultId:'',keys:{}});}
 private profile(id:string){const data=this.saved(),profile=data.profiles.find(p=>p.id===id);if(!profile)throw new Error(tr('AI 服务已不存在'));return {data,profile};}
 async state():Promise<AIState>{const data=this.saved();return {profiles:[...data.profiles].sort((a,b)=>Number(b.id===data.defaultId)-Number(a.id===data.defaultId)).map(p=>({...p,hasKey:!!data.keys[p.id],local:p.kind==='codex'||isLoopback(new URL(p.baseUrl))})),defaultId:data.defaultId,secureStorage:await safeStorage.isAsyncEncryptionAvailable()};}
 async save(value:unknown){
  const v=validateAIProfile(value),data=this.saved(),previous=v.id?data.profiles.find(p=>p.id===v.id):undefined;if(v.id&&!previous)throw new Error(tr('AI 服务已不存在'));if(!v.id&&data.profiles.length>=20)throw new Error(tr('最多保存 20 个 AI 服务'));
  const id=v.id||randomUUID();let encrypted:string|undefined=data.keys[id];
  if(previous&&encrypted&&(previous.baseUrl!==v.baseUrl||previous.kind!==v.kind)&&!v.apiKey&&!v.clearKey)throw new Error(tr('服务地址改变后需重新填写密钥'));
  if(v.clearKey)encrypted=undefined;
  if(v.apiKey){if(!await safeStorage.isAsyncEncryptionAvailable())throw new Error(tr('Windows 安全存储不可用，密钥未保存'));encrypted=(await safeStorage.encryptStringAsync(v.apiKey)).toString('base64');}
  const {apiKey,clearKey,...fields}=v;const profile:AIProfile={...fields,id,revision:randomUUID()};const keys={...data.keys};if(encrypted)keys[id]=encrypted;else delete keys[id];
  this.store.setMeta('ai-profiles',{profiles:previous?data.profiles.map(p=>p.id===id?profile:p):[...data.profiles,profile],defaultId:data.defaultId||id,keys});this.cancelProfile(id);return id;
 }
 remove(id:string){const data=this.saved();const profiles=data.profiles.filter(p=>p.id!==id),keys={...data.keys};delete keys[id];this.store.setMeta('ai-profiles',{profiles,keys,defaultId:data.defaultId===id?profiles[0]?.id||'':data.defaultId});this.cancelProfile(id);}
 setDefault(id:string){const {data}=this.profile(id);this.store.setMeta('ai-profiles',{...data,defaultId:id});}
 reorder(ids:unknown){const data=this.saved();if(!Array.isArray(ids)||ids.length!==data.profiles.length||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!data.profiles.some(profile=>profile.id===id)))throw new Error(tr('AI 服务顺序无效'));const profiles=ids.map(id=>data.profiles.find(profile=>profile.id===id)!);this.store.setMeta('ai-profiles',{...data,profiles});}
 private async secret(id:string){const {data}=this.profile(id);if(!data.keys[id])return '';try{return (await safeStorage.decryptStringAsync(Buffer.from(data.keys[id],'base64'))).result;}catch{throw new Error(tr('无法解密该服务密钥，请重新填写'));}}
 private async execute<T>(id:string,profileId:string,fn:(profile:AIProfile,key:string,signal:AbortSignal)=>Promise<T>){
  requestId(id);if(this.active.has(id))throw new Error(tr('请求编号已在使用'));if(this.active.size>=2)throw new Error(tr('已有两个 AI 请求，请等待或取消'));const {profile}=this.profile(profileId),controller=new AbortController();this.active.set(id,{profileId,controller});const timer=setTimeout(()=>controller.abort('timeout'),profile.timeoutSeconds*1000);
  try{const key=await this.secret(profileId);if(controller.signal.aborted)throw new Error('cancelled');return await fn(profile,key,controller.signal);}catch(e){if(controller.signal.aborted)throw new Error(controller.signal.reason==='timeout'?tr('请求超时，可增加等待时间或更换模型'):tr('请求已取消'));if(e instanceof TypeError)throw new Error(tr('无法连接服务，请检查地址、服务是否启动或证书；不跟随重定向'));throw e;}finally{clearTimeout(timer);this.active.delete(id);}
 }
 models(profileId:string,id:string){return this.execute(id,profileId,(profile,key,signal)=>profile.kind==='codex'?this.codex.models(signal):fetchModels(profile,key,signal));}
 modelCatalog(profileId:string,id:string){return this.execute(id,profileId,async(profile,key,signal)=>{const discovered=profile.kind==='codex'&&this.codex.catalog?await this.codex.catalog(signal):(await (profile.kind==='codex'?this.codex.models(signal):fetchModels(profile,key,signal))).map(id=>({id,name:id}));const {data,profile:current}=this.profile(profileId);if(current.revision!==profile.revision)throw new Error(tr('服务配置已改变，请重新选择后发送'));const models=new Map((current.models||[]).map(model=>[model.id,model]));if(current.model&&!models.has(current.model))models.set(current.model,{id:current.model,name:current.model});for(const model of discovered.slice(0,100)){const configured=models.get(model.id);models.set(model.id,{...model,name:configured?.name&&configured.name!==configured.id?configured.name:model.name});}const catalog=[...models.values()].slice(0,100);this.store.setMeta('ai-profiles',{...data,profiles:data.profiles.map(item=>item.id===profileId?{...item,models:catalog}:item)});return catalog;});}
 async codexStatus(){return {...await this.codex.status(),customExecutable:this.store.meta('codex-executable','')};}
 async codexModels(id:string):Promise<AIModel[]>{
  requestId(id);if(this.active.has(id))throw new Error(tr('请求编号已在使用'));if(this.active.size>=2)throw new Error(tr('已有两个 AI 请求，请等待或取消'));
  const controller=new AbortController();this.active.set(id,{profileId:'codex',controller});const timer=setTimeout(()=>controller.abort('timeout'),30000);
  try{return this.codex.catalog?await this.codex.catalog(controller.signal):(await this.codex.models(controller.signal)).map(id=>({id,name:id}));}
  catch(error){if(controller.signal.aborted)throw new Error(controller.signal.reason==='timeout'?tr('请求超时，可增加等待时间或更换模型'):tr('请求已取消'));throw error;}
  finally{clearTimeout(timer);this.active.delete(id);}
 }
 async codexLogin(){this.cancelCodex();return {...await this.codex.login(),customExecutable:this.store.meta('codex-executable','')};}
 codexSetExecutable(file:string){
  if(file)codexExecutables({executable:file});this.cancelCodex();this.codex.dispose();this.store.setMeta('codex-executable',file);this.codex=localCodex(this.store);return this.codexStatus();
 }
 codexCancelLogin(){return this.codex.cancelLogin();}
 codexLogout(){this.cancelCodex();return this.codex.logout();}
 private cancelCodex(){const ids=new Set(['codex',...this.saved().profiles.filter(profile=>profile.kind==='codex').map(profile=>profile.id)]);for(const task of this.active.values())if(ids.has(task.profileId))task.controller.abort('cancelled');}
 private image(value:AIRequest['image']){
  if(value===undefined)return undefined;
  if(!value||typeof value.clipId!=='string'||typeof value.hash!=='string'||value.clipId.length>80||value.hash.length>128)throw new Error(tr('图片请求无效'));
  const clip=this.store.get(value.clipId);if(clip.hash!==value.hash||!clip.payload.png)throw new Error(tr('原图片已改变或不存在，请重新打开后处理'));
  const png=clip.payload.png;if(typeof png!=='string'||!/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(png)||Buffer.byteLength(png,'base64')>16*1024*1024)throw new Error(tr('AI 图片无效或超过 16 MiB'));return png;
 }
 run(value:AIRequest){
  if(!value||typeof value.profileId!=='string')throw new Error(tr('AI 请求无效'));
  const messages=()=>value.command?commandMessages(this.commands.get(value.command.id,value.command.revision),value.input,value.language,value.command.values):aiMessages(value);
  messages();this.image(value.image);
  return this.execute(value.requestId,value.profileId,(profile,key,signal)=>{
   if(value.revision!==profile.revision)throw new Error(tr('服务配置已改变，请重新打开预览后发送'));
   if(value.approvedDestination!==aiEndpoint(profile))throw new Error(tr('请先确认实际接收内容的服务地址'));
   const png=this.image(value.image),resolved=messages();
   if(png)resolved[0].content+=' The attached image is the source material. For translation, summarization or rewriting, use text visible in the image. Otherwise follow the user\'s request about the image.';
   return profile.kind==='codex'?this.codex.generate(profile,resolved,signal,png):generateText(profile,value,key,signal,resolved,png);
  });
 }
 chat(value:{requestId:string;profileId:string;revision:string;approvedDestination:string}&AISelection,messages:ChatWireMessage[],delta:(text:string)=>void){
  return this.execute(value.requestId,value.profileId,(profile,key,signal)=>{
   if(value.revision!==profile.revision)throw new Error(tr('服务配置已改变，请重新选择后发送'));
   if(value.approvedDestination!==aiEndpoint(profile))throw new Error(tr('接收内容的服务已改变，请重新选择'));
   const selected=selectAIModel(profile,value);return selected.kind==='codex'?this.codex.generate(selected,messages,signal,undefined,{chat:true,delta}):streamChat(selected,messages,key,signal,delta);
  });
 }
 cancel(id:string){requestId(id);this.active.get(id)?.controller.abort('cancelled');}
 private cancelProfile(id:string){for(const task of this.active.values())if(task.profileId===id)task.controller.abort('cancelled');}
 dispose(){for(const task of this.active.values())task.controller.abort('cancelled');this.codex.dispose();}
}
