const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
(async()=>{
 const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('reference-data');
 try{
  const data=JSON.parse(await fs.readFile('src/renderer/reference-data/cheatsheets.json','utf8'));
  assert.equal(data.revision,'6f382a13d72f3c4ce67f3d6f3f38f6f930d01a6c');
  assert.deepEqual(data.topics.map(topic=>[topic.id,topic.sections.length,topic.sections.reduce((sum,section)=>sum+section.items,0)]),[['git',100,147],['latex',50,334],['bash',92,244],['linux',25,181],['regex',104,371]]);
  for(const topic of data.topics)assert.equal(createHash('sha256').update(topic.markdown).digest('hex'),topic.sha256);
  await require('esbuild').build({stdin:{contents:"export {renderCheatBlocks} from './src/renderer/cheatsheet-renderer';export {rendererAssetAllowed} from './src/shared/renderer-assets';",resolveDir:process.cwd()},outfile:path.join(work.output,'renderer.cjs'),bundle:true,platform:'node'});
  const {renderCheatBlocks,rendererAssetAllowed}=require(path.join(work.output,'renderer.cjs'));
  const rendered=renderCheatBlocks([{type:'paragraph',text:'<img src=x onerror=alert(1)> [bad](javascript:alert(1))'},{type:'code',language:'bash',text:'echo "<test> & ok"\n'}]);
  assert.ok(!rendered.includes('<img')&&!rendered.includes('href="javascript:'));
  assert.ok(rendered.includes('data-code="echo &quot;&lt;test&gt; &amp; ok&quot;\n"'));
  const formula=renderCheatBlocks([{type:'paragraph',text:'`KaTeX:\\alpha`'}]);assert.ok(formula.includes('class="katex"')&&formula.includes('data-code="\\alpha"'));
  const emoji=JSON.parse(await fs.readFile('src/renderer/reference-data/emoji.json','utf8')),art=JSON.parse(await fs.readFile('src/renderer/reference-data/emoji-art.json','utf8'));
  assert.equal(emoji.length,3944);assert.equal(Object.keys(art.glyphs).length,emoji.length);
  for(const [glyph]of emoji)assert.ok(Number.isInteger(art.glyphs[glyph]),'Missing graphic '+glyph);
  for(const sheet of art.pages){const png=await fs.readFile('assets/emoji-atlas/'+sheet.file);assert.equal(png.readUInt32BE(16),art.pageSize);assert.equal(png.readUInt32BE(20),art.pageSize);assert.equal(createHash('sha256').update(png).digest('hex'),sheet.sha256);assert.ok(rendererAssetAllowed('main','emoji-atlas/'+sheet.file));}
  for(const name of ['emoji-atlas/../app.js','emoji-atlas/sheet-99.png','emoji-atlas/sheet-00.svg','katex-fonts/../../main/index.cjs'])assert.equal(rendererAssetAllowed('main',name),false);
  console.log('Pinned complete QuickRef documents, safe JSON rendering and all 3,944 offline emoji graphics passed.');
 }finally{await work.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
