import {t as tr} from '../shared/i18n';
import {aiEndpoint,MAX_TOOL_OUTPUT,type AIProfile,type AIResult} from '../shared/text-tools';
import type {ChatWireMessage} from '../shared/chat';
import {readJsonResponse} from './ai-transport';

/** SSE / NDJSON are decoded incrementally; neither network chunks nor UTF-8 boundaries are message boundaries. */
export async function streamChat(profile:AIProfile,messages:ChatWireMessage[],key:string,signal:AbortSignal,delta:(text:string)=>void):Promise<AIResult>{
 if(!profile.model)throw new Error(tr('请先填写或选择模型'));
 const outgoing=messages.map(({role,content,images})=>!images?.length?{role,content}:profile.kind==='ollama'?{role,content,images:images.map(image=>image.png)}:{role,content:[{type:'text',text:content},...images.map(image=>({type:'image_url',image_url:{url:'data:image/png;base64,'+image.png}}))]});
 const options=profile.temperature===null?{}:{temperature:profile.temperature},body=profile.kind==='ollama'?{model:profile.model,messages:outgoing,stream:true,options:{...options,num_predict:profile.maxTokens}}:{model:profile.model,messages:outgoing,stream:true,...options,[profile.tokenField]:profile.maxTokens};
 const response=await fetch(aiEndpoint(profile),{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify(body),signal,redirect:'error',credentials:'omit'});
 if(!response.ok){await readJsonResponse(response);throw new Error(tr('请求失败'));}
 if(response.headers.get('content-type')?.includes('application/json')&&!response.headers.get('content-type')?.includes('ndjson')){
  const data=await readJsonResponse(response),text=profile.kind==='ollama'?data.message?.content:data.choices?.[0]?.message?.content;
  if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text)>MAX_TOOL_OUTPUT)throw new Error(tr('服务未返回可用文字'));delta(text);return {text,model:profile.model,truncated:data.choices?.[0]?.finish_reason==='length'};
 }
 if(!response.body)throw new Error(tr('服务未返回内容'));
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',eventData:string[]=[],text='',bytes=0,total=0,complete=false,truncated=false;
 const append=(value:unknown)=>{if(typeof value!=='string')return;bytes+=Buffer.byteLength(value);if(bytes>MAX_TOOL_OUTPUT)throw new Error(tr('服务返回文字超过 1 MiB'));text+=value;delta(value);};
 const consume=(value:string)=>{if(!value.trim())return;if(value.trim()==='[DONE]'){complete=true;return;}let data:any;try{data=JSON.parse(value);}catch{throw new Error(tr('服务返回了无效流式数据'));}if(data.error)throw new Error(tr('服务拒绝了对话请求，请检查模型与参数'));if(profile.kind==='ollama'){append(data.message?.content);if(data.done){complete=true;truncated=data.done_reason==='length';}}else{const choice=data.choices?.[0];append(choice?.delta?.content);if(choice?.finish_reason){complete=true;truncated=choice.finish_reason==='length';}}};
 const line=(value:string)=>{value=value.replace(/\r$/,'');if(profile.kind==='ollama'){consume(value);return;}if(value.startsWith('data:'))eventData.push(value.slice(5).trimStart());else if(!value&&eventData.length){consume(eventData.join('\n'));eventData=[];}};
 try{for(;;){signal.throwIfAborted();const chunk=await reader.read();if(chunk.done)break;total+=chunk.value.length;if(total>8*1024*1024)throw new Error(tr('服务流式响应过大'));buffer+=decoder.decode(chunk.value,{stream:true});if(buffer.length>2*1024*1024)throw new Error(tr('服务流式响应过大'));let at:number;while((at=buffer.indexOf('\n'))>=0){line(buffer.slice(0,at));buffer=buffer.slice(at+1);}}
  buffer+=decoder.decode();if(buffer)line(buffer);if(eventData.length)consume(eventData.join('\n'));if(!complete)throw new Error(tr('连接中断，请重试'));if(!text.trim())throw new Error(tr('服务未返回可用文字'));return {text,model:profile.model,truncated};
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
