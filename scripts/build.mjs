import './build-document-info.mjs';
import './build-fonts.mjs';
import './build-images.mjs';
import './build-sources.mjs';
import './build-attachments.mjs';
import './build-updater.mjs';
import './notices.mjs';
import {build} from 'esbuild';
import {mkdir,copyFile,readFile,writeFile,rm,lstat,realpath} from 'node:fs/promises';
import {resolve,sep,dirname} from 'node:path';
import {bundles,staticFiles} from './bundle-options.mjs';
const readerOutput=resolve('dist/renderer/text-preview'),workspace=await realpath('.');
// Retire outputs from the removed image-based emoji renderer on existing checkouts.
for(const name of ['dist/renderer/reference-emoji-worker.js','dist/renderer/emoji-atlas','dist/renderer/selection.js','dist/renderer/selection.css','dist/renderer/selection.html','dist/preload/selection.cjs','dist/native/SelectionHost.exe']){
 const expected=resolve(workspace,name);if(!expected.startsWith(workspace+sep))throw new Error('Unsafe retired output');
 try{const stat=await lstat(expected);if(stat.isSymbolicLink()||await realpath(expected)!==expected)throw new Error('Unsafe retired output link');await rm(expected,{recursive:stat.isDirectory()});}catch(error){if(error.code!=='ENOENT')throw error;}
}
try{const stat=await lstat(readerOutput);if(stat.isSymbolicLink())throw new Error('Unsafe generated reader link');const target=await realpath(readerOutput);if(target!==resolve(workspace,'dist/renderer/text-preview')||!target.startsWith(workspace+sep))throw new Error('Unsafe generated reader output');await rm(readerOutput,{recursive:true});}catch(error){if(error.code!=='ENOENT')throw error;}
await Promise.all(bundles.map(({options})=>build(options)));
for(const [source,target,bom]of staticFiles){await mkdir(dirname(target),{recursive:true});if(bom)await writeFile(target,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),await readFile(source)]));else await copyFile(source,target);}
console.log('Clipper build complete.');
