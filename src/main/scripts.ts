import {utilityProcess,dialog,type BrowserWindow,type UtilityProcess} from 'electron';
import {randomUUID} from 'node:crypto';
import {join,basename} from 'node:path';
import {readFile,writeFile,stat} from 'node:fs/promises';
import type {Store} from './store';
import {requestId,toolText,validateScript,MAX_TOOL_OUTPUT,type TextScript,type TextScriptInput,type ScriptRequest} from '../shared/text-tools';
const defaults:TextScriptInput[]=[
 {name:'清理首尾空白',description:'去掉每行两侧空白，并移除首尾空行。',code:"return input.split(/\\r?\\n/).map(line => line.trim()).join('\\n').trim();",timeoutMs:1500,permission:'selected-text'},
 {name:'按行去重',description:'保留第一次出现的每一行，顺序不变。',code:"return [...new Set(input.split(/\\r?\\n/))].join('\\n');",timeoutMs:1500,permission:'selected-text'},
 {name:'格式化 JSON',description:'检查 JSON 并按两个空格缩进排版。',code:'return JSON.stringify(JSON.parse(input), null, 2);',timeoutMs:1500,permission:'selected-text'}
];
export class ScriptService {
 private active:{id:string;child:UtilityProcess;cancel:()=>void}|undefined;
 constructor(private store:Store){if(store.meta('text-scripts',null)===null)store.setMeta('text-scripts',defaults.map(s=>({...s,id:randomUUID(),updatedAt:Date.now()})));}
 list():TextScript[]{return this.store.meta('text-scripts',[]);}
 private persist(scripts:TextScript[]){if(scripts.length>100||Buffer.byteLength(JSON.stringify(scripts))>4*1024*1024)throw new Error('脚本最多 100 个，总内容不超过 4 MiB');this.store.setMeta('text-scripts',scripts);}
 save(value:unknown){const v=validateScript(value),scripts=this.list(),old=v.id?scripts.find(s=>s.id===v.id):undefined;if(v.id&&!old)throw new Error('脚本已不存在');const s:TextScript={...v,id:v.id||randomUUID(),updatedAt:Math.max(Date.now(),(old?.updatedAt||0)+1)};this.persist([...scripts.filter(x=>x.id!==s.id),s]);return s.id;}
 remove(id:string){this.persist(this.list().filter(s=>s.id!==id));}
 run(value:ScriptRequest):Promise<string>{
  if(!value)throw new Error('脚本请求无效');requestId(value.requestId);toolText(value.input);if(value.permission!=='selected-text')throw new Error('请确认脚本的选中文字权限');const script=this.list().find(s=>s.id===value.scriptId);if(!script)throw new Error('脚本已不存在');if(script.updatedAt!==value.updatedAt)throw new Error('脚本已改变，请重新预览代码');if(this.active)throw new Error('已有脚本正在运行，请等待或取消');
  return new Promise((resolve,reject)=>{const child=utilityProcess.fork(join(__dirname,'script-worker.cjs'),[],{serviceName:'Clipper 文本脚本',stdio:'ignore',execArgv:['--max-old-space-size=96'],env:{SystemRoot:process.env.SystemRoot||'C:\\Windows',TEMP:process.env.TEMP||'',TMP:process.env.TMP||''}});let done=false;
   const finish=(error:Error|null,text?:string)=>{if(done)return;done=true;clearTimeout(timer);this.active=undefined;child.kill();error?reject(error):resolve(text!);};
   const timer=setTimeout(()=>finish(new Error('脚本工作进程超时，已终止')),script.timeoutMs+5000);this.active={id:value.requestId,child,cancel:()=>finish(new Error('脚本已取消'))};
   child.on('message',(result:any)=>{try{if(!result?.ok)throw new Error(typeof result?.error==='string'?result.error:'脚本失败');finish(null,toolText(result.text,MAX_TOOL_OUTPUT));}catch(e){finish(e as Error);}});child.on('exit',()=>finish(new Error('脚本工作进程退出，内容未改变')));child.once('spawn',()=>{if(done)return;try{child.postMessage({code:script.code,input:value.input,timeoutMs:script.timeoutMs});}catch{finish(new Error('无法启动脚本任务，内容未改变'));}});
  });
 }
 cancel(id:string){requestId(id);if(this.active?.id===id)this.active.cancel();}
 dispose(){this.active?.cancel();}
 async backup(window:BrowserWindow,mode:unknown,protect:(file:string)=>void=()=>{}){
  if(mode==='export'){const result=await dialog.showSaveDialog(window,{title:'导出文本脚本',defaultPath:'Clipper-scripts.json',filters:[{name:'Clipper 脚本',extensions:['json']}]});if(result.canceled||!result.filePath)return null;protect(result.filePath);await writeFile(result.filePath,JSON.stringify({format:'clipper-scripts',version:1,scripts:this.list()},null,2),'utf8');return '已导出 '+basename(result.filePath);}
  if(mode!=='import')throw new Error('脚本备份操作无效');const result=await dialog.showOpenDialog(window,{title:'导入文本脚本',properties:['openFile'],filters:[{name:'Clipper 脚本',extensions:['json']}]});if(result.canceled)return null;const file=result.filePaths[0];if((await stat(file)).size>8*1024*1024)throw new Error('脚本文件过大');const value=JSON.parse(await readFile(file,'utf8'));if(value?.format!=='clipper-scripts'||value.version!==1||!Array.isArray(value.scripts)||value.scripts.length>100)throw new Error('不是支持的脚本备份');const incoming=value.scripts.map(validateScript),next=this.list();let added=0;for(const s of incoming)if(!next.some(t=>t.name===s.name&&t.code===s.code)){next.push({...s,id:randomUUID(),updatedAt:Date.now()});added++;}this.persist(next);return `已导入 ${added} 个脚本；运行前请预览代码`;
 }
}
