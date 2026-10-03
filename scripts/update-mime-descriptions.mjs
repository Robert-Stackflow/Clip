// Reproducible offline description snapshot. Builds never request this source.
import {readFile,writeFile} from 'node:fs/promises';
import {DOMParser} from '@xmldom/xmldom';

const revision='ccec84eb030fbfddcceffe063621e74ca81b13a3';
const base=`https://raw.githubusercontent.com/apache/tika/${revision}/`;
async function get(file){
 const local=process.argv[2];
 if(local)return readFile(`${local}/${file.split('/').at(-1)}`,'utf8');
 let failure;
 for(let attempt=0;attempt<3;attempt++)try{
  const response=await fetch(base+file,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`${file}: ${response.status}`);
  return response.text();
 }catch(error){failure=error;}
 throw failure;
}

const [xml,license,notice]=await Promise.all([
 get('tika-core/src/main/resources/org/apache/tika/mime/tika-mimetypes.xml'),
 get('LICENSE.txt'),get('NOTICE.txt')
]);
const types=new Set(JSON.parse(await readFile('src/renderer/reference-data/mime-details.json','utf8')).map(([type])=>type));
const curated=new Set(Object.keys(JSON.parse(await readFile('src/renderer/reference-data/catalog-metadata.json','utf8')).mimeDescriptions));
const document=new DOMParser({onError:(level,message)=>{if(level==='error'||level==='fatalError')throw new Error(message);}}).parseFromString(xml,'text/xml');
const result=new Map();
for(const node of Array.from(document.getElementsByTagName('mime-type'))){
 const type=node.getAttribute('type')?.toLowerCase();
 const description=Array.from(node.childNodes).find(child=>child.nodeType===1&&['_comment','comment'].includes(child.nodeName)&&!child.getAttribute('xml:lang'))?.textContent?.replace(/\s+/g,' ').trim();
 if(!type||!description||description.length>180)continue;
 for(const name of [type,...Array.from(node.getElementsByTagName('alias'),alias=>alias.getAttribute('type')?.toLowerCase()).filter(Boolean)]){
  if(types.has(name)&&!curated.has(name)&&!result.has(name))result.set(name,description);
 }
}
const data=Object.fromEntries([...result].sort(([a],[b])=>a.localeCompare(b)));
const cleanLicense=text=>text.replaceAll('\r\n','\n').split('\n').map(line=>line.trimEnd()).join('\n');
await writeFile('src/renderer/reference-data/mime-descriptions.json',JSON.stringify(data,null,2)+'\n');
await writeFile('src/renderer/reference-data/TIKA-LICENSE.txt',cleanLicense(license));
await writeFile('src/renderer/reference-data/TIKA-NOTICE.txt',cleanLicense(notice));
console.log(`${Object.keys(data).length} MIME types gained source descriptions.`);
