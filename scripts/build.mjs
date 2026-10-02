import './build-document-info.mjs';
import './build-fonts.mjs';
import './build-images.mjs';
import './build-selection.mjs';
import './build-attachments.mjs';
import './build-updater.mjs';
import './notices.mjs';
import {build} from 'esbuild';
import {mkdir,copyFile,readFile,writeFile,rm,lstat,realpath} from 'node:fs/promises';
import {resolve,sep,dirname} from 'node:path';
import {bundles,staticFiles} from './bundle-options.mjs';
const readerOutput=resolve('dist/renderer/text-preview'),workspace=await realpath('.');
try{const stat=await lstat(readerOutput);if(stat.isSymbolicLink())throw new Error('Unsafe generated reader link');const target=await realpath(readerOutput);if(target!==resolve(workspace,'dist/renderer/text-preview')||!target.startsWith(workspace+sep))throw new Error('Unsafe generated reader output');await rm(readerOutput,{recursive:true});}catch(error){if(error.code!=='ENOENT')throw error;}
await Promise.all(bundles.map(({options})=>build(options)));
for(const [source,target,bom]of staticFiles){await mkdir(dirname(target),{recursive:true});if(bom)await writeFile(target,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),await readFile(source)]));else await copyFile(source,target);}
console.log('Clipper build complete.');
