import './build-selection.mjs';
import './build-attachments.mjs';
import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import './notices.mjs';
await mkdir('dist/renderer', { recursive: true });
await build({entryPoints:['src/main/index.ts'],outfile:'dist/main/index.cjs',bundle:true,platform:'node',target:'node22',external:['electron','koffi','better-sqlite3-multiple-ciphers'],sourcemap:true});
await build({entryPoints:['src/main/script-worker.ts'],outfile:'dist/main/script-worker.cjs',bundle:true,platform:'node',target:'node22',external:['quickjs-emscripten','better-sqlite3-multiple-ciphers']});
await build({entryPoints:['src/main/backup-worker.ts'],outfile:'dist/main/backup-worker.cjs',bundle:true,platform:'node',target:'node22',external:['better-sqlite3-multiple-ciphers']});
await build({entryPoints:['src/preload/tray.ts','src/preload/index.ts','src/preload/capture.ts','src/preload/recovery.ts','src/preload/unlock.ts','src/preload/shelf.ts','src/preload/selection.ts','src/preload/recorder.ts','src/preload/scroll.ts','src/preload/image-editor.ts'],outdir:'dist/preload',outExtension:{'.js':'.cjs'},bundle:true,platform:'node',target:'node22',external:['electron']});
await build({entryPoints:['src/renderer/tray.ts','src/renderer/app.ts','src/renderer/capture.ts','src/renderer/recovery.ts','src/renderer/unlock.ts','src/renderer/shelf.ts','src/renderer/selection.ts','src/renderer/recorder.ts','src/renderer/scroll.ts','src/renderer/image-editor.ts'],outdir:'dist/renderer',bundle:true,platform:'browser',target:'chrome138'});
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
