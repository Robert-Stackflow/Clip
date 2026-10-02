import {spawnSync} from 'node:child_process';
import {mkdir,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
if(process.platform!=='win32')throw new Error('SelectionHost must be built on Windows with .NET Framework');
const framework=join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319'),compiler=join(framework,'csc.exe');
await access(compiler);await mkdir('dist/native',{recursive:true});
const result=spawnSync(compiler,['/nologo','/optimize+','/target:exe','/platform:x64','/out:'+resolve('dist/native/SelectionHost.exe'),'/win32manifest:'+resolve('native/SelectionHost.manifest'),'/reference:'+join(framework,'WPF','UIAutomationClient.dll'),'/reference:'+join(framework,'WPF','UIAutomationTypes.dll'),'/reference:'+join(framework,'WPF','WindowsBase.dll'),'/reference:'+join(framework,'System.Web.Extensions.dll'),resolve('native/SelectionHost.cs')],{encoding:'utf8',windowsHide:true});
if(result.status!==0)throw new Error(result.error?.message||result.stdout||result.stderr||'SelectionHost compilation failed');
