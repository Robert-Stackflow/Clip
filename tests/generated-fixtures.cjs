const fs=require('node:fs'),path=require('node:path'),{after}=require('node:test');
const work=path.resolve('work','Clip'),current=path.join(work,'current');
const root=path.resolve(process.env.CLIP_TEST_FIXTURE_DIR||path.join(current,'direct-unit','fixtures'));
const rel=path.relative(current,root);
if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Unit fixtures must stay inside work/Clip/current');
fs.mkdirSync(root,{recursive:true});
for(let item=root;item!==work;item=path.dirname(item))if(fs.lstatSync(item).isSymbolicLink()||fs.realpathSync(item)!==item)throw Error('Linked unit fixture root');
const allocated=new Set();
exports.directory=root;
function detachLinks(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isSymbolicLink())fs.unlinkSync(file);else if(entry.isDirectory())detachLinks(file);}}
function prefix(value){const name=path.basename(value);if(!/^[a-zA-Z0-9-]+$/.test(name))throw Error('Invalid unit fixture prefix');return path.join(root,name);}
function own(file){allocated.add(file);return file;}
exports.mkdtempSync=value=>own(fs.mkdtempSync(prefix(value)));
exports.mkdtemp=async value=>own(await fs.promises.mkdtemp(prefix(value)));
after(()=>{
 for(const file of allocated){
  if(!fs.existsSync(file))continue;
  const rel=path.relative(root,file);
  if(!rel||rel.startsWith('..')||path.isAbsolute(rel)||fs.realpathSync(file)!==file)throw Error('Unit fixture cleanup boundary changed');
  detachLinks(file);fs.rmSync(file,{recursive:true,force:true,maxRetries:3,retryDelay:100});
 }
});
