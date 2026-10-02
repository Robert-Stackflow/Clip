import {spawnSync} from 'node:child_process';
import {mkdir,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const framework=join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319'),compiler=join(framework,'csc.exe');
await access(compiler);await mkdir('dist/native',{recursive:true});
for(const name of ['UpdateHost','RollbackHost']){
 const result=spawnSync(compiler,['/nologo','/optimize+','/target:exe','/platform:x64','/out:'+resolve('dist/native/'+name+'.exe'),'/win32manifest:'+resolve('native/SelectionHost.manifest'),'/reference:'+join(framework,'System.Web.Extensions.dll'),resolve('native/'+name+'.cs'),resolve('native/ProgramVersions.cs')],{encoding:'utf8',windowsHide:true});
 if(result.status!==0)throw new Error(result.error?.message||result.stdout||result.stderr||name+' compilation failed');
}
