import {getQuickJS} from 'quickjs-emscripten';
import {toolText,MAX_TOOL_OUTPUT,validateScript} from '../shared/text-tools';
export async function evaluateScript(code:string,input:string,timeoutMs:number):Promise<string>{
 validateScript({name:'run',description:'',code,timeoutMs,permission:'selected-text'});toolText(input);const engine=await getQuickJS(),runtime=engine.newRuntime();runtime.setMemoryLimit(32*1024*1024);runtime.setMaxStackSize(512*1024);const deadline=Date.now()+timeoutMs;runtime.setInterruptHandler(()=>Date.now()>=deadline);const vm=runtime.newContext();
 try{const result=vm.evalCode(`(function(input){"use strict";\n${code}\n})(${JSON.stringify(input)})`,'clipper-text-script.js');
  if(result.error){let message='脚本运行失败';try{const error=vm.dump(result.error);if(error&&typeof error.message==='string')message=error.message.slice(0,800);}catch{}finally{result.error.dispose();}if(Date.now()>=deadline)throw new Error('脚本超过运行时限');throw new Error(message);}
  try{if(vm.typeof(result.value)!=='string')throw new Error('脚本必须返回字符串，不支持异步任务');return toolText(vm.getString(result.value),MAX_TOOL_OUTPUT);}finally{result.value.dispose();}
 }finally{vm.dispose();runtime.dispose();}
}
