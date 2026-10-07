import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,rename,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {workspace,repository} from './workspace.mjs';
import {newestVersions,releasePlan,staging,validateRelease,retainReleases,removeRelease} from './release.mjs';

process.chdir(repository);
const execute=promisify(execFile),work=await workspace(),source=repository,root=join(source,'release');
const flags=process.argv.slice(2),graphical=flags.includes('--installer'),installer=graphical||flags.includes('--installer-engine');
if(flags.length>1||flags.some(flag=>!['--installer','--installer-engine'].includes(flag)))throw Error('Unknown packaging option');
const version=JSON.parse(await readFile('package.json','utf8')).version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Release version must have three numeric components');
const destination=join(root,version);
try{await lstat(destination);throw Error('This version already exists. Update the source version before packaging; use npm run dev for daily work.');}
catch(error){if(error.code!=='ENOENT')throw error;}

async function activePrograms(){
 const result=await execute('powershell.exe',['-NoProfile','-Command',"Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(Clipper|electron)\\.exe$' } | Select-Object -ExpandProperty ExecutablePath"],{windowsHide:true});
 return result.stdout.split(/\r?\n/).filter(Boolean);
}
const existing=await releasePlan(root),versions=[...existing.retained,...existing.remove],keep=newestVersions([...versions,version]).slice(0,2);
if(!keep.includes(version))throw Error('New release must be newer than the retained versions');
const active=await activePrograms();
for(const old of versions.filter(value=>!keep.includes(value)))if(active.some(file=>file.toLowerCase().startsWith((join(root,old)+'\\').toLowerCase())))
 throw Error('An old release is running. Exit it from its tray menu before packaging.');

const candidate=await staging(root,version);
const env={...process.env,TEMP:work.temp,TMP:work.temp,ELECTRON_BUILDER_CACHE:join(work.root,'builder-cache')};
delete env.CLIPPER_DEVELOPMENT;delete env.CLIPPER_DEV_DATA_DIR;
let failure;
try{
 const built=await execute(process.execPath,['scripts/build.mjs'],{cwd:source,env,windowsHide:true,maxBuffer:8*1024*1024});process.stdout.write(built.stdout);
 const packed=await execute(process.execPath,['node_modules/electron-builder/out/cli/cli.js','--win',installer?'nsis':'dir','--x64','--config.directories.output='+candidate,'--publish','never'],{cwd:source,env,windowsHide:true,maxBuffer:8*1024*1024});process.stdout.write(packed.stdout);
 if(graphical){
  const wrapped=await execute(process.execPath,['scripts/build-installer.mjs','--engine',join(candidate,'Clipper-'+version+'-Setup-Engine-x64.exe'),'--asar',join(candidate,'win-unpacked/resources/app.asar'),'--output',join(candidate,'Clipper-'+version+'-Setup-x64.exe')],{cwd:source,env,windowsHide:true,maxBuffer:8*1024*1024});process.stdout.write(wrapped.stdout);
 }
 const verified=await validateRelease(candidate,source,version);
 await writeFile(join(candidate,'verified-build.json'),JSON.stringify({...verified,createdAt:new Date().toISOString()},null,2));
 await rename(candidate,destination);
 const retention=await retainReleases(root,await activePrograms());
 console.log(JSON.stringify({folder:destination,verified,...retention}));
}catch(error){
 failure=error;
 await writeFile(join(work.root,'package-error.log'),(error.stdout||'')+(error.stderr||'')+'\n'+String(error));
 throw error;
}finally{
 try{await lstat(candidate);await removeRelease(root,candidate);}
 catch(error){if(error.code!=='ENOENT'){if(failure)console.error('Candidate cleanup also failed: '+error.message);else throw error;}}
}
