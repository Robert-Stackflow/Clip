// Shared by normal builds and Electron development, following One's workflow.
const common={bundle:true,preserveSymlinks:true};
const node={...common,platform:'node',target:'node22'};
const browser={...common,platform:'browser',target:'chrome138'};
export const bundles=[
 {name:'main',restart:true,options:{...node,entryPoints:['src/main/index.ts'],outfile:'dist/main/index.cjs',external:['electron','koffi','better-sqlite3-multiple-ciphers'],sourcemap:true}},
 ...[
  ['script-worker',['quickjs-emscripten','better-sqlite3-multiple-ciphers']],
  ['backup-worker',['better-sqlite3-multiple-ciphers']],['recovery-worker',['better-sqlite3-multiple-ciphers']],
  ['scroll-worker',[]],['metadata-worker',['koffi']],['sync-files-worker',['koffi']],
  ['sync-item-worker',['better-sqlite3-multiple-ciphers']],['sync-receive-worker',['better-sqlite3-multiple-ciphers']],['search-worker',['better-sqlite3-multiple-ciphers']],['preview-image-worker',['better-sqlite3-multiple-ciphers']],
  ['capture-writer-worker',['better-sqlite3-multiple-ciphers']]
 ].map(([name,external])=>({name,restart:true,options:{...node,entryPoints:['src/main/'+name+'.ts'],outfile:'dist/main/'+name+'.cjs',external}})),
 {name:'preload',restart:true,options:{...node,entryPoints:['tray','index','capture','recovery','unlock','shelf','selection','recorder','scroll','image-editor'].map(name=>'src/preload/'+name+'.ts'),outdir:'dist/preload',outExtension:{'.js':'.cjs'},external:['electron']}},
 {name:'renderer',restart:false,options:{...browser,entryPoints:['tray','app','capture','recovery','unlock','shelf','selection','recorder','scroll','image-editor'].map(name=>'src/renderer/'+name+'.ts'),outdir:'dist/renderer'}},
 {name:'text-preview',restart:false,options:{...browser,entryPoints:['src/renderer/text-preview.ts'],outdir:'dist/renderer/text-preview',format:'esm',splitting:true}},
 {name:'text-preview-worker',restart:false,options:{...browser,entryPoints:['src/renderer/text-preview-worker.ts'],outfile:'dist/renderer/text-preview-worker.js'}},
 {name:'web',restart:false,options:{...common,entryPoints:['src/web/app.ts'],outdir:'dist/web',platform:'browser',target:'es2022'}},
 {name:'styles',restart:false,options:{...common,entryPoints:['src/renderer/one-ui.css'],outfile:'dist/renderer/one-ui.css',target:'chrome138'}}
];
export const staticFiles=[
 ...['index','capture','recovery','unlock','shelf','selection','recorder','scroll','image-editor','tray'].map(name=>['src/renderer/'+name+'.html','dist/renderer/'+name+'.html']),
 ['src/web/index.html','dist/web/index.html'],['src/main/ocr.ps1','dist/main/ocr.ps1',true],
 ['assets/clipper.png','dist/clipper.png'],['src/renderer/wav-worklet.js','dist/renderer/wav-worklet.js'],
 ...['one-components','redesign-028','recent-shelf','redesign-029','one-dialog'].map(name=>['src/renderer/'+name+'.css','dist/renderer/'+name+'.css'])
];
