// Reproducible offline extension snapshot. Builds do not access the network.
import {readFile,writeFile} from 'node:fs/promises';
const base='https://raw.githubusercontent.com/jshttp/mime-db/v1.54.0/';
const get=async name=>{let error;for(let attempt=0;attempt<3;attempt++)try{const r=await fetch(base+name,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`${name}: ${r.status}`);return await r.text();}catch(e){error=e;}throw error;};
const [content,license]=await Promise.all([get('db.json'),get('LICENSE')]);
const db=JSON.parse(content);
const registered=JSON.parse(await readFile('src/renderer/reference-data/mime.json','utf8'));
const types=[...new Set([...registered.map(type=>type.toLowerCase()),...Object.keys(db)])].sort();
await writeFile('src/renderer/reference-data/mime-details.json',JSON.stringify(types.map(type=>[type,db[type]?.extensions||[],db[type]?.charset||''])));
await writeFile('src/renderer/reference-data/MIME-DB-LICENSE.txt',license);
console.log(`${types.length} MIME types, ${types.filter(type=>db[type]?.extensions?.length).length} with known extensions.`);
