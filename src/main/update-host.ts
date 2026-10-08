import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {copyFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {UpdateRelease} from '../shared/updates';
const execute=promisify(execFile);
const host=()=>join(__dirname,'../native/UpdateHost.exe').replace('app.asar','app.asar.unpacked');
export async function installedClip(){try{const result=await execute(host(),['--probe',Buffer.from(process.execPath).toString('base64')],{windowsHide:true,timeout:5000});return result.stdout.trim()==='true';}catch{return false;}}
export async function activeUpdate(folder:string){try{const result=await execute(host(),['--active',Buffer.from(folder).toString('base64')],{windowsHide:true,timeout:5000});return result.stdout.trim()!=='false';}catch{return true;}}
export async function armUpdate(folder:string,release:UpdateRelease,valid:()=>boolean,checkpoint?:{id:string;profileId:string}){
  if(!checkpoint)throw new Error('UPDATE_CHECKPOINT_REQUIRED');
  await copyFile(host(),join(folder,'UpdateHost.exe'));
  await writeFile(join(folder,'handoff.json'),JSON.stringify({pid:process.pid,executable:process.execPath,version:release.version,sha256:release.sha256,checkpointId:checkpoint.id,profileId:checkpoint.profileId}),{mode:0o600});
  if(!valid())throw new Error('UPDATE_UNSAVED');
  return await new Promise<()=>void>((resolve,reject)=>{
    const child=spawn(join(folder,'UpdateHost.exe'),[join(folder,'handoff.json')],{windowsHide:true,detached:true,stdio:['pipe','pipe','pipe']});let output='',settled=false,sent=false;
    const savedPID=child.pid?writeFile(join(folder,'host.pid'),String(child.pid)):Promise.reject(new Error('UPDATE_HOST_ERROR'));
    const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){child.kill();reject(error);}else{child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();child.unref();resolve(()=>child.kill());}};
    const timer=setTimeout(()=>finish(new Error('UPDATE_HOST_ERROR')),10000);
    child.on('error',e=>finish(e));child.on('exit',()=>finish(new Error('UPDATE_HOST_ERROR')));
    child.stdin.on('error',e=>finish(e));void savedPID.catch(e=>finish(e));child.stdout.on('data',value=>{output+=String(value);if(output.includes('ready')&&!sent){sent=true;void savedPID.then(()=>{if(!valid())return finish(new Error('UPDATE_UNSAVED'));if(!settled)child.stdin.write('install\n');}).catch(e=>finish(e));}if(output.includes('armed'))finish();});
  });
}
