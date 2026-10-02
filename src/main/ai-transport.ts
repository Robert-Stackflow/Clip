import {t as tr} from '../shared/i18n';
import type { AIProfile, AIRequest, AIResult } from '../shared/text-tools';
import { aiEndpoint, aiMessages, toolText, MAX_TOOL_OUTPUT } from '../shared/text-tools';
export async function readJsonResponse(response:Response){
 if(!response.ok){await response.body?.cancel();const hint=response.status===401||response.status===403?tr('认证失败，请检查密钥'):response.status===404?tr('地址或模型不存在'):response.status===429?tr('服务限流或额度不足'):tr('请求被服务拒绝，请检查模型与参数');throw new Error(tr`${hint}（HTTP ${response.status}）`);}
 const max=4*1024*1024;if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw new Error(tr('服务响应超过 4 MiB'));}
 if(!response.body)throw new Error(tr('服务未返回内容'));const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max)throw new Error(tr('服务响应超过 4 MiB'));chunks.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error(tr('服务返回了无效 JSON，请检查接口地址'));}
}
function headers(key:string){return {'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})};}
export async function fetchModels(profile:AIProfile,key:string,signal:AbortSignal):Promise<string[]>{
 const result=await readJsonResponse(await fetch(aiEndpoint(profile,true),{headers:headers(key),signal,redirect:'error',credentials:'omit'}));
 const values=profile.kind==='ollama'?result.models:result.data;if(!Array.isArray(values))throw new Error(tr('服务模型列表格式不兼容'));
 return [...new Set(values.map((v:any)=>profile.kind==='ollama'?v?.name:v?.id).filter((v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=200))].slice(0,500) as string[];
}
export async function generateText(profile:AIProfile,value:AIRequest,key:string,signal:AbortSignal):Promise<AIResult>{
 if(!profile.model)throw new Error(tr('请先填写或选择模型'));const messages=aiMessages(value);
 const options={...(profile.temperature===null?{}:{temperature:profile.temperature})};
 const body=profile.kind==='ollama'?{model:profile.model,messages,stream:false,options:{...options,num_predict:profile.maxTokens}}:{model:profile.model,messages,stream:false,...options,[profile.tokenField]:profile.maxTokens};
 const data=await readJsonResponse(await fetch(aiEndpoint(profile),{method:'POST',headers:headers(key),body:JSON.stringify(body),signal,redirect:'error',credentials:'omit'}));
 const content=profile.kind==='ollama'?data.message?.content:data.choices?.[0]?.message?.content;if(typeof content!=='string'||!content.trim())throw new Error(tr('服务没有返回可用文字；请检查模型是否支持聊天文本接口'));const text=toolText(content,MAX_TOOL_OUTPUT);
 const token=(n:unknown)=>Number.isInteger(n)&&(n as number)>=0&&(n as number)<1e9?n as number:undefined;
 return {text,model:profile.model,inputTokens:token(profile.kind==='ollama'?data.prompt_eval_count:data.usage?.prompt_tokens),outputTokens:token(profile.kind==='ollama'?data.eval_count:data.usage?.completion_tokens),truncated:(profile.kind==='ollama'?data.done_reason:data.choices?.[0]?.finish_reason)==='length'};
}
