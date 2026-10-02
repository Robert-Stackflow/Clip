import {spawnSync} from 'node:child_process';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
const metadata=spawnSync('cargo',['metadata','--manifest-path','native/document-info/Cargo.toml','--locked','--offline','--format-version','1'],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
if(metadata.status!==0)throw new Error(metadata.stderr||'Cargo metadata failed');
const output=['Clipper document information helper — Rust dependencies','The following dependency versions are locked in Cargo.lock.',''];
const missing=[];
for(const pkg of JSON.parse(metadata.stdout).packages.filter(p=>p.source).sort((a,b)=>a.name.localeCompare(b.name))){
 const root=dirname(pkg.manifest_path),names=await readdir(root),candidates=names.filter(n=>/^(?:licen[sc]e|copying|notice|unlicense|authors)(?:[._-].*)?$/i.test(n));
 if(pkg.license_file&&!candidates.includes(pkg.license_file))candidates.push(pkg.license_file);
 output.push(`${pkg.name} ${pkg.version} (${pkg.license||'see license file'})`,pkg.repository||'', '');let found=false;
 for(const name of candidates){try{const content=await readFile(join(root,name),'utf8');if(content){output.push(name,content,'');found=true;}}catch(error){if(error.code!=='EISDIR')throw error;}}
 if(!found&&pkg.name==='alloc-stdlib'){output.push(await readFile('licenses/alloc-stdlib.txt','utf8'));found=true;}
 if(!found)missing.push(pkg.name);
}
if(missing.length)throw new Error('Missing Rust license texts: '+missing.join(', '));
export const rustNotices=output.join('\n').replaceAll('\r\n','\n');
await writeFile('licenses/Rust-dependencies.txt',rustNotices);
