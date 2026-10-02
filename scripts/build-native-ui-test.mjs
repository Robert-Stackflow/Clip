import {build} from 'esbuild';import {resolve} from 'node:path';
await build({entryPoints:['src/main/appearance-service.ts'],outfile:'work/native-ui-028-service.cjs',platform:'node',bundle:true,external:['electron'],define:{__dirname:JSON.stringify(resolve('dist/main'))}});
await build({entryPoints:['tests/native-ui-028-renderer.ts'],outfile:'work/native-ui-028.js',platform:'browser',bundle:true});
