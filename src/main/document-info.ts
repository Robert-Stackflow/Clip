import {t as tr} from '../shared/i18n';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {limitChildProcess} from './native';
export const documentErrors:Record<string,string>={PASSWORD_REQUIRED:'此文档需要打开密码，请填写后重新读取',BAD_PASSWORD:'文档密码不正确，请重新输入',DOCUMENT_UNSUPPORTED:'此文档的加密方式暂不支持',DOCUMENT_INVALID:'文档数据、密码校验或内部结构无效',DOCUMENT_LIMIT:'文档解析超过容量或复杂度限制'};
// Password and input only cross private pipes; neither is put on argv or written to disk.
export function documentInformation(bytes:Buffer,name:string,mode:'pdf'|'office',password=''):Promise<{fields?:Record<string,unknown>;package?:Buffer}>{
 if(bytes.length>64*1024*1024||Buffer.byteLength(password)>2048)throw new Error(tr('文档或密码超过容量限制'));
 return new Promise((resolve,reject)=>{const child=spawn(join(__dirname,'../native/DocumentInfo.exe').replace(/([\\/])app\.asar([\\/])/,'$1app.asar.unpacked$2'),[],{stdio:['pipe','pipe','ignore'],windowsHide:true}),header=Buffer.from(JSON.stringify({mode,name,size:bytes.length,password})),length=Buffer.alloc(4);length.writeUInt32LE(header.length);const chunks:Buffer[]=[];let size=0,done=false,release=()=>{};
  const finish=(error?:Error,result?:{fields?:Record<string,unknown>;package?:Buffer})=>{if(done)return;done=true;clearTimeout(timer);child.kill();release();header.fill(0);length.fill(0);for(const chunk of chunks)chunk.fill(0);error?reject(error):resolve(result!);};const timer=setTimeout(()=>finish(new Error(tr('文档读取超过 15 秒，已停止'))),15000);
  child.once('spawn',()=>{try{if(!child.pid)throw new Error(tr('文档读取进程无法启动'));release=limitChildProcess(child.pid,512);child.stdin.write(length);child.stdin.write(header);child.stdin.end(bytes);}catch(e){finish(e as Error);}});child.once('error',e=>finish(e));child.stdin.on('error',e=>finish(e));child.stdout.on('data',(data:Buffer)=>{size+=data.length;if(size>64*1024*1024+1)return finish(new Error(tr('文档返回超过容量限制')));chunks.push(data);});child.once('close',code=>{if(done)return;try{if(code!==0||!size)throw new Error(tr('文档解析进程已停止'));const result=Buffer.concat(chunks);try{if(result[0]===0)throw new Error(tr(documentErrors[result.subarray(1).toString('utf8')]||documentErrors.DOCUMENT_INVALID));if(result[0]===2)finish(undefined,{package:Buffer.from(result.subarray(1))});else if(result[0]===1){if(result.length>64*1024)throw new Error(tr('文档返回超过容量限制'));finish(undefined,{fields:JSON.parse(result.subarray(1).toString('utf8'))});}else throw new Error(tr(documentErrors.DOCUMENT_INVALID));}finally{result.fill(0);}}catch(e){finish(e as Error);}});
 });
}
