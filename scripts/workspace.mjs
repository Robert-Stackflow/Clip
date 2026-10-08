import {mkdir,readdir,readFile,writeFile,lstat,realpath,rm,unlink,stat} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

export const repository=resolve(fileURLToPath(new URL('..',import.meta.url)));
export const storageLimits={cases:20,records:128*1024**2};
const workspaceMarker='Clip generated verification workspace\n';
const caseMarker='Clip generated verification case\n';

async function directory(file) {
 await mkdir(file,{recursive:true});
 if((await lstat(file)).isSymbolicLink()||await realpath(file)!==resolve(file))throw Error('Linked generated directory: '+file);
}
async function assertTree(file,unlinkLinks=false) {
 const item=await lstat(file);
 if(item.isSymbolicLink()){if(unlinkLinks){await unlink(file);return;}throw Error('Linked generated contents: '+file);}
 if(item.isDirectory())for(const name of await readdir(file))await assertTree(join(file,name),unlinkLinks);
}
async function bytes(file) {
 const item=await lstat(file);
 if(item.isSymbolicLink())throw Error('Linked generated contents: '+file);
 if(!item.isDirectory())return Math.ceil(item.size/4096)*4096;
 let size=0;for(const name of await readdir(file))size+=await bytes(join(file,name));return size;
}
function inside(root,file) {
 const rel=relative(resolve(root),resolve(file));
 if(!rel||rel==='..'||rel.startsWith('..\\')||rel.startsWith('../')||isAbsolute(rel))throw Error('Generated path is outside its boundary');
}
async function marked(folder,marker,content) {
 await directory(folder);const entries=await readdir(folder),file=join(folder,marker);
 if(!entries.length){try{await writeFile(file,content,{flag:'wx'});}catch(error){if(error.code!=='EEXIST'||await readFile(file,'utf8')!==content)throw error;}return;}
 if(await readFile(file,'utf8').catch(()=>'')!==content)throw Error('Unmarked generated directory: '+folder);
}
async function active(folder) {
 const text=await readFile(join(folder,'.active'),'utf8').catch(()=>'');
 if(!text)return false;
 const pid=Number(text);if(!Number.isInteger(pid)||pid<=0)throw Error('Invalid generated case lock');
 try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}
}
export async function workspace() {
 const root=join(repository,'work','Clip'),temp=join(root,'temp'),current=join(root,'current');
 await directory(root);await directory(temp);await marked(current,'.clip-generated-workspace',workspaceMarker);
 return{root,temp,current};
}
export async function removeGenerated(root,file,{unlinkLinks=false}={}) {
 inside(root,file);
 if(await realpath(root)!==resolve(root))throw Error('Linked cleanup boundary');
 const folder=resolve(file);
 if((await lstat(folder)).isSymbolicLink()||await realpath(folder)!==folder)throw Error('Linked cleanup target');
 await assertTree(folder,unlinkLinks);
 await rm(folder,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
export async function pruneWorkspace(current,limits=storageLimits) {
 if(await readFile(join(current,'.clip-generated-workspace'),'utf8')!==workspaceMarker)throw Error('Missing workspace marker');
 const cases=[];
 for(const item of await readdir(current,{withFileTypes:true})) {
  if(!item.isDirectory())continue;
  const folder=join(current,item.name);
  if(await readFile(join(folder,'.clip-generated-case'),'utf8').catch(()=>'')!==caseMarker||await active(folder))continue;
  cases.push({folder,time:(await stat(folder)).mtimeMs,size:await bytes(folder)});
 }
 cases.sort((a,b)=>b.time-a.time);let count=0,total=0;
 for(const item of cases) {
  if(count>=limits.cases||total+item.size>limits.records)await removeGenerated(current,item.folder);
  else{count++;total+=item.size;}
 }
 return{retained:count,bytes:total};
}
export async function beginCase(name) {
 if(!/^[a-z0-9-]+$/.test(name))throw Error('Invalid verification name');
 const work=await workspace(),output=join(work.current,name),fixtures=join(output,'fixtures');
 await marked(output,'.clip-generated-case',caseMarker);
 try{await writeFile(join(output,'.active'),String(process.pid),{flag:'wx'});}
 catch(error){
  if(error.code!=='EEXIST')throw error;
  if(await active(output))throw Error('Verification is already running: '+name);
  await unlink(join(output,'.active'));
  await writeFile(join(output,'.active'),String(process.pid),{flag:'wx'});
 }
 try{
  if(await lstat(fixtures).catch(()=>null))await removeGenerated(output,fixtures,{unlinkLinks:true});
  await directory(fixtures);
 }catch(error){await unlink(join(output,'.active'));throw error;}
 return{...work,output,fixtures,async close(){
  try{if(await lstat(fixtures).catch(()=>null))await removeGenerated(output,fixtures,{unlinkLinks:true});}
  finally{await unlink(join(output,'.active'));await pruneWorkspace(work.current);}
 }};
}
