// Offline index of the RFC references attached to IANA media-type registrations.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DOMParser} from '@xmldom/xmldom';

const sources=[
 ['media-types.xml','https://www.iana.org/assignments/media-types/media-types.xml','0cbb8819dfe01c1badc71f8ba836291ba43718a5e797287cd1ac00d49f168ffb'],
 ['rfc-index.xml','https://www.rfc-editor.org/rfc/rfc-index.xml','0e0321f330b8668d8ee860a918b8743af88743f4ee5a908535c57a87aa21e68c']
];
async function source([name,url,hash]){
 let content;
 if(process.argv[2])content=await readFile(`${process.argv[2]}/${name}`);
 else{
  let failure;
  for(let attempt=0;attempt<3;attempt++)try{const response=await fetch(url,{signal:AbortSignal.timeout(40000)});if(!response.ok)throw Error(`${url}: ${response.status}`);content=Buffer.from(await response.arrayBuffer());break;}catch(error){failure=error;}
  if(!content)throw failure;
 }
 const actual=createHash('sha256').update(content).digest('hex');
 if(actual!==hash)throw Error(`${name} changed (${actual}); review and intentionally update the snapshot hash`);
 return new DOMParser({onError:(level,message)=>{if(level==='error'||level==='fatalError')throw Error(message);}}).parseFromString(content.toString('utf8'),'text/xml');
}
const [iana,rfcs]=await Promise.all(sources.map(source));
const child=(node,name)=>Array.from(node.childNodes).find(item=>item.nodeType===1&&item.localName===name)?.textContent?.trim();
const titles=new Map();
for(const node of Array.from(rfcs.getElementsByTagName('rfc-entry'))){
 const id=child(node,'doc-id')?.toLowerCase(),title=child(node,'title');
 if(id&&title)titles.set(id,title.replace(/\s+/g,' '));
}
const types=new Set(JSON.parse(await readFile('src/renderer/reference-data/mime-details.json','utf8')).map(([type])=>type));
const result={};
for(const node of Array.from(iana.getElementsByTagName('record'))){
 const file=Array.from(node.childNodes).find(item=>item.nodeType===1&&item.localName==='file'&&item.getAttribute('type')==='template')?.textContent?.trim().toLowerCase();
 if(!file||!types.has(file))continue;
 const references=Array.from(node.childNodes).filter(item=>item.nodeType===1&&item.localName==='xref'&&item.getAttribute('type')==='rfc').map(item=>item.getAttribute('data')?.toLowerCase()).filter(Boolean);
 const entries=references.map(id=>[id.toUpperCase(),titles.get(id)]).filter(([,title])=>title);
 if(entries.length)result[file]=entries;
}
await writeFile('src/renderer/reference-data/mime-rfc.json',JSON.stringify(Object.fromEntries(Object.entries(result).sort(([a],[b])=>a.localeCompare(b))),null,2)+'\n');
console.log(`${Object.keys(result).length} MIME registrations have RFC references and titles.`);
