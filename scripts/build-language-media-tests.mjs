import {build} from 'esbuild';
await build({entryPoints:['tests/language-media-exports.ts'],outfile:'work/test-language-media-windows.cjs',bundle:true,platform:'node',target:'node22',external:['electron','./native','./clipboard','./recording-sources','koffi']});
await build({entryPoints:['src/main/metadata-worker.ts'],outfile:'work/test-language-metadata-worker.cjs',bundle:true,platform:'node',target:'node22',external:['koffi']});
await build({entryPoints:['src/main/scroll-worker.ts'],outfile:'work/test-language-scroll-worker.cjs',bundle:true,platform:'node',target:'node22'});
