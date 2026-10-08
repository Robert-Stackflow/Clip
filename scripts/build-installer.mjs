import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,stat,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {repository} from './workspace.mjs';

const execute=promisify(execFile);
const flags=process.argv.slice(2);
const value=name=>{const index=flags.indexOf(name);if(index<0||!flags[index+1])throw Error(`Missing ${name}`);return resolve(flags[index+1]);};
if(flags.length!==6)throw Error('Usage: node scripts/build-installer.mjs --engine <NSIS exe> --asar <app.asar> --output <setup exe>');
const engine=value('--engine'),asar=value('--asar'),output=value('--output');
const pkg=JSON.parse(await readFile(join(repository,'package.json'),'utf8'));
const version=pkg.version;
const namespace=Buffer.from('50e065bc313411e69bab38c9862bdaf3','hex');
const bytes=createHash('sha1').update(Buffer.concat([namespace,Buffer.from(pkg.build.appId)])).digest().subarray(0,16);
bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
const hex=bytes.toString('hex');
const guid=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
async function sha256(file){
 const hash=createHash('sha256');
 for await(const chunk of createReadStream(file))hash.update(chunk);
 return hash.digest('hex');
}
if(engine===output)throw Error('Installer output cannot overwrite its engine');
const info={version,product:'Clip',guid,engineHash:await sha256(engine),engineBytes:(await stat(engine)).size,asarHash:await sha256(asar)};
const staging=join(dirname(output),'electron-installer-build');
await mkdir(staging,{recursive:true});
const infoFile=join(staging,'build-info.json');
await writeFile(infoFile,JSON.stringify(info,null,2));
const config={
 appId:'com.cloudchewie.clip.setup',productName:'Clip Setup',extraMetadata:{version},electronVersion:pkg.devDependencies.electron,
 electronDist:join(repository,'node_modules/electron/dist'),npmRebuild:false,buildDependenciesFromSource:false,asar:true,
 directories:{output:staging},files:['package.json','main.cjs','preload.cjs','index.html','style.css','renderer.js','icon.png'],
 extraResources:[{from:engine,to:'engine/Clip-Setup-Engine.exe'},{from:infoFile,to:'build-info.json'}],
 win:{target:'portable',icon:join(repository,'assets/clip.ico'),executableName:'ClipSetup',signAndEditExecutable:true,signExecutable:false},
 portable:{artifactName:`Clip-${version}-Setup-x64.exe`}
};
const configFile=join(staging,'electron-builder.json');
await writeFile(configFile,JSON.stringify(config,null,2));
const env={...process.env,ELECTRON_BUILDER_CACHE:join(repository,'work/Clip/builder-cache')};
const result=await execute(process.execPath,['node_modules/electron-builder/out/cli/cli.js','--projectDir',join(repository,'installer'),'--config',configFile,'--win','portable','--x64','--publish','never'],{cwd:repository,env,windowsHide:true,maxBuffer:8*1024*1024});
if(result.stdout)process.stdout.write(result.stdout);
if(result.stderr)process.stderr.write(result.stderr);
await copyFile(join(staging,`Clip-${version}-Setup-x64.exe`),output);
console.log(JSON.stringify({installer:output,engine,info,bytes:(await stat(output)).size}));
