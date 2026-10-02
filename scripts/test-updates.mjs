import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import './build-updater.mjs';
await build({entryPoints:['src/main/updates.ts'],outfile:'work/test-updates.cjs',bundle:true,platform:'node',target:'node22'});
await build({entryPoints:['src/main/update-transport.ts'],outfile:'work/test-update-transport.cjs',bundle:true,platform:'node',target:'node22'});
await build({entryPoints:['src/shared/updates.ts'],outfile:'work/test-update-core.cjs',bundle:true,platform:'node',target:'node22'});
const result=spawnSync(process.execPath,['--test','tests/update-core.cjs','tests/update-service.cjs','tests/update-transport.cjs'],{stdio:'inherit'});process.exitCode=result.status??1;
