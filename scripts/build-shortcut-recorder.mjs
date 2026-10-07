import {spawnSync} from 'node:child_process';
import {mkdir,access,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const framework=join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319'),compiler=join(framework,'csc.exe');
await access(compiler);await mkdir('dist/native',{recursive:true});
const output=resolve('dist/native/ShortcutHost.exe'),manifest=resolve('native/HelperHost.manifest'),reference=join(framework,'System.Web.Extensions.dll'),sources=['ShortcutHost.cs','WinVShortcut.cs'].map(name=>resolve('native',name));
const existing=await stat(output).catch(error=>{if(error.code!=='ENOENT')throw error;});
const inputs=await Promise.all([...sources,manifest,reference,compiler].map(file=>stat(file)));
// The Win+V helper stays running with dev. Only rebuild when an input changed.
if(!existing||inputs.some(input=>input.mtimeMs>existing.mtimeMs)){
 const result=spawnSync(compiler,['/nologo','/optimize+','/target:exe','/platform:x64','/out:'+output,'/win32manifest:'+manifest,'/reference:'+reference,...sources],{encoding:'utf8',windowsHide:true});
 if(result.status!==0)throw new Error(result.error?.message||result.stdout||result.stderr||'ShortcutHost compilation failed');
}
