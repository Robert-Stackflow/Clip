/** Exact asset names shared by the native window protocols; no filesystem paths from callers. */
export type RendererAssetScope='main'|'recording'|'scroll'|'image-editor';
const styles=new Set(['one-ui.css','recent-shelf.css','one-components.css','redesign-028.css','redesign-029.css']);
const assets:Record<RendererAssetScope,ReadonlySet<string>>={
 main:new Set(['index.html','app.js','app.css','reference-pages.js','reference-flags.ttf',...['capture','recovery','unlock','tray','shelf'].flatMap(name=>[name+'.html',name+'.js',name+'.css'])]),
 recording:new Set(['recorder.html','recorder.js','recorder.css','wav-worklet.js']),
 scroll:new Set(['scroll.html','scroll.js','scroll.css']),
 'image-editor':new Set(['image-editor.html','image-editor.js','image-editor.css'])
};
export function rendererAssetAllowed(scope:RendererAssetScope,name:string){return styles.has(name)||assets[scope]?.has(name)||scope==='main'&&/^katex-fonts\/KaTeX_[\w-]+\.(?:woff2|woff|ttf)$/.test(name)||scope==='main'&&/^(?:text-preview\/[\w.-]+\.(?:js|css)|text-preview-worker\.js)$/.test(name)||false;}
