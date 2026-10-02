import {safeStorage} from 'electron';
import {randomUUID} from 'node:crypto';
import type {Store} from './store';
import type {AIProfile,AIRequest,AIState} from '../shared/text-tools';
import {validateAIProfile,isLoopback,requestId,aiEndpoint,aiMessages} from '../shared/text-tools';
import {fetchModels,generateText} from './ai-transport';
interface SavedAI {profiles:AIProfile[];defaultId:string;keys:Record<string,string>}
export class AIService {
 private active=new Map<string,{profileId:string;controller:AbortController}>();
 constructor(private store:Store){}
 private saved():SavedAI {return this.store.meta('ai-profiles',{profiles:[],defaultId:'',keys:{}});}
 private profile(id:string){const data=this.saved(),profile=data.profiles.find(p=>p.id===id);if(!profile)throw new Error('AI 服务已不存在');return {data,profile};}
 async state():Promise<AIState>{const data=this.saved();return {profiles:data.profiles.map(p=>({...p,hasKey:!!data.keys[p.id],local:isLoopback(new URL(p.baseUrl))})),defaultId:data.defaultId,secureStorage:await safeStorage.isAsyncEncryptionAvailable()};}
 async save(value:unknown){
  const v=validateAIProfile(value),data=this.saved(),previous=v.id?data.profiles.find(p=>p.id===v.id):undefined;if(v.id&&!previous)throw new Error('AI 服务已不存在');if(!v.id&&data.profiles.length>=20)throw new Error('最多保存 20 个 AI 服务');
  const id=v.id||randomUUID();let encrypted:string|undefined=data.keys[id];
  if(previous&&encrypted&&(previous.baseUrl!==v.baseUrl||previous.kind!==v.kind)&&!v.apiKey&&!v.clearKey)throw new Error('服务地址改变后需重新填写密钥，或选择清除旧密钥');
  if(v.clearKey)encrypted=undefined;
  if(v.apiKey){if(!await safeStorage.isAsyncEncryptionAvailable())throw new Error('Windows 安全存储不可用，密钥未保存');encrypted=(await safeStorage.encryptStringAsync(v.apiKey)).toString('base64');}
  const {apiKey,clearKey,...fields}=v;const profile:AIProfile={...fields,id,revision:randomUUID()};const keys={...data.keys};if(encrypted)keys[id]=encrypted;else delete keys[id];
  this.store.setMeta('ai-profiles',{profiles:[...data.profiles.filter(p=>p.id!==id),profile],defaultId:data.defaultId||id,keys});this.cancelProfile(id);return id;
 }
 remove(id:string){const data=this.saved();const profiles=data.profiles.filter(p=>p.id!==id),keys={...data.keys};delete keys[id];this.store.setMeta('ai-profiles',{profiles,keys,defaultId:data.defaultId===id?profiles[0]?.id||'':data.defaultId});this.cancelProfile(id);}
 setDefault(id:string){const {data}=this.profile(id);this.store.setMeta('ai-profiles',{...data,defaultId:id});}
 private async secret(id:string){const {data}=this.profile(id);if(!data.keys[id])return '';try{return (await safeStorage.decryptStringAsync(Buffer.from(data.keys[id],'base64'))).result;}catch{throw new Error('无法解密该服务密钥，请重新填写');}}
 private async execute<T>(id:string,profileId:string,fn:(profile:AIProfile,key:string,signal:AbortSignal)=>Promise<T>){
  requestId(id);if(this.active.has(id))throw new Error('请求编号已在使用');if(this.active.size>=2)throw new Error('已有两个 AI 请求，请等待或取消');const {profile}=this.profile(profileId),controller=new AbortController();this.active.set(id,{profileId,controller});const timer=setTimeout(()=>controller.abort('timeout'),profile.timeoutSeconds*1000);
  try{const key=await this.secret(profileId);if(controller.signal.aborted)throw new Error('cancelled');return await fn(profile,key,controller.signal);}catch(e){if(controller.signal.aborted)throw new Error(controller.signal.reason==='timeout'?'请求超时，可增加等待时间或更换模型':'请求已取消');if(e instanceof TypeError)throw new Error('无法连接服务，请检查地址、服务是否启动或证书；不跟随重定向');throw e;}finally{clearTimeout(timer);this.active.delete(id);}
 }
 models(profileId:string,id:string){return this.execute(id,profileId,fetchModels);}
 run(value:AIRequest){if(!value||typeof value.profileId!=='string')throw new Error('AI 请求无效');aiMessages(value);return this.execute(value.requestId,value.profileId,(profile,key,signal)=>{if(value.revision!==profile.revision)throw new Error('服务配置已改变，请重新打开预览后发送');if(value.approvedDestination!==aiEndpoint(profile))throw new Error('请先确认实际接收内容的服务地址');return generateText(profile,value,key,signal);});}
 cancel(id:string){requestId(id);this.active.get(id)?.controller.abort('cancelled');}
 private cancelProfile(id:string){for(const task of this.active.values())if(task.profileId===id)task.controller.abort('cancelled');}
 dispose(){for(const task of this.active.values())task.controller.abort('cancelled');}
}
