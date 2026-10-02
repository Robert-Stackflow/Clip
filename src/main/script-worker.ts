import {evaluateScript} from './script-engine';
const port=(process as any).parentPort;
if(!port)throw new Error('脚本工作进程没有父端口');
let used=false;
port.on('message',async(event:{data:{code:string;input:string;timeoutMs:number}})=>{if(used)return;used=true;try{const {code,input,timeoutMs}=event.data;const text=await evaluateScript(code,input,timeoutMs);port.postMessage({ok:true,text});}catch(e){port.postMessage({ok:false,error:String((e as Error)?.message||'脚本工作进程失败').slice(0,1000)});}});
