/** Exact asset names shared by the native window protocols; no filesystem paths from callers. */
export type RendererAssetScope='main';
const styles=new Set(['one-ui.css','recent-shelf.css','one-components.css','control-surfaces.css','redesign-028.css','redesign-029.css']);
const assets:Record<RendererAssetScope,ReadonlySet<string>>={
 main:new Set(['index.html','app.js','app.css','clip-mark.png','reference-pages.js','category-icon-catalog.js','reference-flags.ttf',...['quick','quick-preview','recovery','unlock','tray','tray-menu','shelf','chat'].flatMap(name=>[name+'.html',name+'.js',name+'.css'])]),
};
export function rendererAssetAllowed(scope:RendererAssetScope,name:string){return styles.has(name)||assets[scope]?.has(name)||scope==='main'&&/^katex-fonts\/KaTeX_[\w-]+\.(?:woff2|woff|ttf)$/.test(name)||scope==='main'&&/^(?:text-preview\/[\w.-]+\.(?:js|css)|text-preview-worker\.js)$/.test(name)||false;}
