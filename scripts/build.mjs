import './build-document-info.mjs';
import './build-fonts.mjs';
import './build-selection.mjs';
import './build-attachments.mjs';
import './build-updater.mjs';
import { build as bundle } from 'esbuild';
// A private dependency junction and its physical checkout must emit identical chunk names.
const build=options=>bundle({...options,preserveSymlinks:true});
import { mkdir, copyFile, readFile, writeFile, rm, lstat, realpath } from 'node:fs/promises';
import './notices.mjs';
import {resolve,sep} from 'node:path';
const readerOutput=resolve('dist/renderer/text-preview'),workspace=await realpath('.');
try{const stat=await lstat(readerOutput);if(stat.isSymbolicLink())throw new Error('Unsafe generated reader link');const target=await realpath(readerOutput);if(target!==resolve(workspace,'dist/renderer/text-preview')||!target.startsWith(workspace+sep))throw new Error('Unsafe generated reader output');await rm(readerOutput,{recursive:true});}catch(error){if(error.code!=='ENOENT')throw error;}
await mkdir('dist/renderer', { recursive: true });
await build({entryPoints:['src/main/index.ts'],outfile:'dist/main/index.cjs',bundle:true,platform:'node',target:'node22',external:['electron','koffi','better-sqlite3-multiple-ciphers'],sourcemap:true});
await build({entryPoints:['src/main/script-worker.ts'],outfile:'dist/main/script-worker.cjs',bundle:true,platform:'node',target:'node22',external:['quickjs-emscripten','better-sqlite3-multiple-ciphers']});
await build({entryPoints:['src/main/backup-worker.ts'],outfile:'dist/main/backup-worker.cjs',bundle:true,platform:'node',target:'node22',external:['better-sqlite3-multiple-ciphers']});
await build({entryPoints:['src/main/recovery-worker.ts'],outfile:'dist/main/recovery-worker.cjs',bundle:true,platform:'node',target:'node22',external:['better-sqlite3-multiple-ciphers']});
await build({entryPoints:['src/preload/tray.ts','src/preload/index.ts','src/preload/capture.ts','src/preload/recovery.ts','src/preload/unlock.ts','src/preload/shelf.ts','src/preload/selection.ts','src/preload/recorder.ts','src/preload/scroll.ts','src/preload/image-editor.ts'],outdir:'dist/preload',outExtension:{'.js':'.cjs'},bundle:true,platform:'node',target:'node22',external:['electron']});
await build({entryPoints:['src/renderer/tray.ts','src/renderer/app.ts','src/renderer/capture.ts','src/renderer/recovery.ts','src/renderer/unlock.ts','src/renderer/shelf.ts','src/renderer/selection.ts','src/renderer/recorder.ts','src/renderer/scroll.ts','src/renderer/image-editor.ts'],outdir:'dist/renderer',bundle:true,platform:'browser',target:'chrome138'});
await build({entryPoints:['src/renderer/text-preview.ts'],outdir:'dist/renderer/text-preview',bundle:true,format:'esm',splitting:true,platform:'browser',target:'chrome138'});
await build({entryPoints:['src/renderer/text-preview-worker.ts'],outfile:'dist/renderer/text-preview-worker.js',bundle:true,platform:'browser',target:'chrome138'});
await copyFile('src/renderer/index.html','dist/renderer/index.html');
await copyFile('src/renderer/capture.html','dist/renderer/capture.html');
await copyFile('src/renderer/recovery.html','dist/renderer/recovery.html');
await copyFile('src/renderer/unlock.html','dist/renderer/unlock.html');
await writeFile('dist/main/ocr.ps1',Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),await readFile('src/main/ocr.ps1')]));
await copyFile('assets/clipper.png','dist/clipper.png');
console.log('Clipper build complete.');

await build({entryPoints:['src/web/app.ts'],outdir:'dist/web',bundle:true,platform:'browser',target:'es2022'});
await copyFile('src/web/index.html','dist/web/index.html');

await copyFile('src/renderer/shelf.html','dist/renderer/shelf.html');

await copyFile('src/renderer/selection.html','dist/renderer/selection.html');

await copyFile('src/renderer/recorder.html','dist/renderer/recorder.html');

await build({entryPoints:['src/main/scroll-worker.ts'],outfile:'dist/main/scroll-worker.cjs',bundle:true,platform:'node',target:'node22'});

await copyFile('src/renderer/scroll.html','dist/renderer/scroll.html');

await copyFile('src/renderer/image-editor.html','dist/renderer/image-editor.html');

await build({entryPoints:['src/main/metadata-worker.ts'],outfile:'dist/main/metadata-worker.cjs',bundle:true,platform:'node',target:'node22',external:['koffi']});

await copyFile('src/renderer/tray.html','dist/renderer/tray.html');

await build({entryPoints:['src/main/sync-files-worker.ts'],outfile:'dist/main/sync-files-worker.cjs',bundle:true,platform:'node',target:'node22',external:['koffi']});

await copyFile('src/renderer/wav-worklet.js','dist/renderer/wav-worklet.js');

await copyFile('src/renderer/one-components.css','dist/renderer/one-components.css');
await copyFile('src/renderer/redesign-028.css','dist/renderer/redesign-028.css');
await copyFile('src/renderer/recent-shelf.css','dist/renderer/recent-shelf.css');

await copyFile('src/renderer/redesign-029.css','dist/renderer/redesign-029.css');

await build({entryPoints:['src/main/search-worker.ts'],outfile:'dist/main/search-worker.cjs',bundle:true,platform:'node',target:'node22',external:['better-sqlite3-multiple-ciphers']});

await build({entryPoints:['src/main/preview-image-worker.ts'],outfile:'dist/main/preview-image-worker.cjs',bundle:true,platform:'node',target:'node22',external:['better-sqlite3-multiple-ciphers']});

await build({entryPoints:['src/main/capture-writer-worker.ts'],outfile:'dist/main/capture-writer-worker.cjs',bundle:true,platform:'node',target:'node22',external:['better-sqlite3-multiple-ciphers']});

await copyFile('src/renderer/one-dialog.css','dist/renderer/one-dialog.css');

// All desktop windows share the same One component stylesheet.
await build({entryPoints:['src/renderer/one-ui.css'],outfile:'dist/renderer/one-ui.css',bundle:true,target:'chrome138'});
