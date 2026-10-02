import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import './build-updater.mjs';
await build({entryPoints:['tests/exports.ts'],outfile:'work/test-exports.cjs',bundle:true,platform:'node',target:'node22',external:['quickjs-emscripten','better-sqlite3-multiple-ciphers','koffi']});
await build({entryPoints:['src/main/recovery-worker.ts'],outfile:'work/recovery-worker.cjs',bundle:true,platform:'node',target:'node22',external:['better-sqlite3-multiple-ciphers']});
const result=spawnSync(process.execPath,['--test','tests/program-versions-core.cjs'],{stdio:'inherit'});process.exitCode=result.status??1;
