// Shared by normal builds and Electron development, following One's workflow.
const common={bundle:true,preserveSymlinks:true};
const node={...common,platform:'node',target:'node22'};
const browser={...common,platform:'browser',target:'chrome138',loader:{'.woff2':'file','.woff':'file','.ttf':'file'},assetNames:'katex-fonts/[name]'};
export const bundles=[
 {name:'main',restart:true,options:{...node,entryPoints:['src/main/index.ts'],outfile:'dist/main/index.cjs',external:['electron','koffi','better-sqlite3-multiple-ciphers'],sourcemap:true}},
 ...[
  ['script-worker',['quickjs-emscripten','better-sqlite3-multiple-ciphers']],
  ['backup-worker',['better-sqlite3-multiple-ciphers']],['backup-preview-worker',['better-sqlite3-multiple-ciphers','koffi']],['backup-restore-worker',['better-sqlite3-multiple-ciphers','koffi']],['recovery-worker',['better-sqlite3-multiple-ciphers']],
  ['metadata-worker',['koffi']],['sync-files-worker',['koffi']],['share-publisher-worker',['koffi','better-sqlite3-multiple-ciphers']],
  ['sync-item-worker',['better-sqlite3-multiple-ciphers']],['sync-receive-worker',['better-sqlite3-multiple-ciphers']],['search-worker',['better-sqlite3-multiple-ciphers']],['tray-query-worker',['better-sqlite3-multiple-ciphers']],['preview-image-worker',['better-sqlite3-multiple-ciphers']],
  ['capture-writer-worker',['better-sqlite3-multiple-ciphers']],['heic-decode-worker',['heic-decode']]
 ].map(([name,external])=>({name,restart:true,options:{...node,entryPoints:['src/main/'+name+'.ts'],outfile:'dist/main/'+name+'.cjs',external}})),
 {name:'preload',restart:true,options:{...node,entryPoints:['quick','quick-preview','tray','tray-menu','index','capture','recovery','unlock','shelf','sticker','chat','recorder','image-editor'].map(name=>'src/preload/'+name+'.ts'),outdir:'dist/preload',outExtension:{'.js':'.cjs'},external:['electron']}},
 {name:'renderer',restart:false,options:{...browser,entryPoints:['quick','quick-preview','tray','tray-menu','app','capture','recovery','unlock','shelf','sticker','chat','recorder','image-editor'].map(name=>'src/renderer/'+name+'.ts'),outdir:'dist/renderer'}},
 {name:'text-preview',restart:false,options:{...browser,entryPoints:['src/renderer/text-preview.ts'],outdir:'dist/renderer/text-preview',format:'esm',splitting:true}},
 {name:'text-preview-worker',restart:false,options:{...browser,entryPoints:['src/renderer/text-preview-worker.ts'],outfile:'dist/renderer/text-preview-worker.js'}},
 {name:'category-icons',restart:false,options:{...browser,entryPoints:['src/renderer/category-icon-catalog.ts'],outfile:'dist/renderer/category-icon-catalog.js',format:'esm'}},
 {name:'reference-pages',restart:false,options:{...browser,entryPoints:['src/renderer/reference-pages.ts'],outfile:'dist/renderer/reference-pages.js',format:'esm'}},
 {name:'web',restart:false,options:{...common,entryPoints:['src/web/app.ts'],outdir:'dist/web',platform:'browser',target:'es2022'}},
 {name:'styles',restart:false,options:{...common,entryPoints:['src/renderer/one-ui.css'],outfile:'dist/renderer/one-ui.css',target:'chrome138',loader:{'.woff2':'file','.woff':'file','.ttf':'file'},assetNames:'katex-fonts/[name]',external:['./reference-flags.ttf']}}
];
export const staticFiles=[
 ...['quick','quick-preview','index','capture','recovery','unlock','shelf','sticker','chat','recorder','image-editor','tray','tray-menu'].map(name=>['src/renderer/'+name+'.html','dist/renderer/'+name+'.html']),
 ['src/web/index.html','dist/web/index.html'],
 ['assets/clip.png','dist/clip.png'],['assets/clip-mark.png','dist/renderer/clip-mark.png'],
 ...[16,20,24,32].map(size=>[`assets/clip-tray-${size}.png`,`dist/clip-tray-${size}.png`]),
 ['src/renderer/wav-worklet.js','dist/renderer/wav-worklet.js'],['src/renderer/reference-flags.ttf','dist/renderer/reference-flags.ttf'],
 ...['one-components','control-surfaces','redesign-028','recent-shelf','redesign-029','one-dialog','sticker'].map(name=>['src/renderer/'+name+'.css','dist/renderer/'+name+'.css'])
];
