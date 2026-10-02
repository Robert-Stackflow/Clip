import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({entryPoints:['tests/exports.ts'],outfile:'work/test-exports.cjs',bundle:true,platform:'node',target:'node22',external:['quickjs-emscripten','better-sqlite3-multiple-ciphers','koffi']});
await build({entryPoints:['src/main/backup-worker.ts'],outfile:'work/test-backup-worker.cjs',bundle:true,platform:'node',target:'node22',external:['better-sqlite3-multiple-ciphers']});
await build({entryPoints:['tests/metadata-exports.ts'],outfile:'work/test-metadata-exports.cjs',bundle:true,platform:'node',target:'node22',external:['koffi']});
const result=spawnSync(process.execPath,['--test','tests/core.cjs','tests/advanced-core.cjs','tests/text-tools-core.cjs','tests/data-core.cjs','tests/recovery-core.cjs','tests/sync-core.cjs','tests/web-core.cjs','tests/vault-core.cjs','tests/desktop-core.cjs','tests/selection-core.cjs','tests/recording-core.cjs','tests/region-core.cjs','tests/image-edit-core.cjs','tests/formats-core.cjs','tests/attachments-core.cjs','tests/metadata-core.cjs','tests/efficiency-core.cjs','tests/stack-core.cjs','tests/folders-core.cjs','tests/tray-core.cjs'],{stdio:'inherit'});process.exitCode=result.status??1;

