import {readFile,writeFile} from 'node:fs/promises';
// Lucide's export table gives canonical filenames, including number suffixes.
const source=await readFile(new URL('../node_modules/lucide/dist/esm/iconsAndAliases.mjs',import.meta.url),'utf8');
const entries=new Map();
for(const match of source.matchAll(/export \{ default as (\w+)[^}]*\} from '\.\/icons\/([^']+)\.mjs';/g))if(!entries.has(match[2]))entries.set(match[2],match[1]);
if(entries.size<1000)throw new Error('Lucide icon catalog unavailable');
const target=new URL('../src/shared/category-icons.json',import.meta.url),content=JSON.stringify(Object.fromEntries([...entries].sort(([a],[b])=>a.localeCompare(b))),null,2)+'\n';
if(await readFile(target,'utf8').catch(()=>null)!==content)await writeFile(target,content);
