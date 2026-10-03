const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
(async()=>{
 const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('reference-data');
 try{
  const data=JSON.parse(await fs.readFile('src/renderer/reference-data/cheatsheets.json','utf8'));
  assert.equal(data.revision,'6f382a13d72f3c4ce67f3d6f3f38f6f930d01a6c');
  assert.deepEqual(data.topics.map(topic=>[topic.id,topic.sections.length,topic.sections.reduce((sum,section)=>sum+section.items,0)]),[['git',100,147],['latex',50,334],['bash',92,244],['linux',25,181],['regex',104,371]]);
  for(const topic of data.topics)assert.equal(createHash('sha256').update(topic.markdown).digest('hex'),topic.sha256);
  await require('esbuild').build({stdin:{contents:"export {renderCheatBlocks} from './src/renderer/cheatsheet-renderer';export {highlightCheatCode} from './src/renderer/cheatsheet-highlight';export {rendererAssetAllowed} from './src/shared/renderer-assets';",resolveDir:process.cwd()},outfile:path.join(work.output,'renderer.cjs'),bundle:true,platform:'node'});
  const {renderCheatBlocks,highlightCheatCode,rendererAssetAllowed}=require(path.join(work.output,'renderer.cjs'));
  const rendered=renderCheatBlocks([{type:'paragraph',text:'<img src=x onerror=alert(1)> [bad](javascript:alert(1))'},{type:'code',language:'bash',text:'echo "<test> & ok"\n'}]);
  assert.ok(!rendered.includes('<img')&&!rendered.includes('href="javascript:'));
  assert.ok(rendered.includes('data-code="echo &quot;&lt;test&gt; &amp; ok&quot;\n"'));
  const formula=renderCheatBlocks([{type:'paragraph',text:'`KaTeX:\\alpha`'}]);assert.ok(formula.includes('class="katex"')&&formula.includes('data-code="\\alpha"'));
  const samples={git:'git config --global core.quotepath false\n# 注释\n',bash:'if true; then echo "$HOME <&>"; fi',linux:'sudo chmod 755 ./file',latex:'\\documentclass{article}\n% 注释\n\\alpha',regex:'^(?<name>\\w+)[0-9]{2,4}$',python:'if True: print("<img>")',javascript:'const value = /a+/g;',php:'echo preg_match("/a+/", $value);',sql:'SELECT * FROM users WHERE id = 42;',ini:'[core]\neditor = vim'};
  const decode=value=>value.replace(/<span class="reference-syntax-[\w -]+">|<\/span>/g,'').replace(/&(?:amp|lt|gt|quot|#39);/g,entity=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[entity]));
  for(const [language,text] of Object.entries(samples)){
   const html=highlightCheatCode(text,language);assert.match(html,/class="reference-syntax-/,language);assert.equal(decode(html),text,language+' must retain every code character');assert.ok(!html.includes('<img>'));
  }
  assert.equal(highlightCheatCode('<unsupported>', 'text'),'&lt;unsupported&gt;');
  assert.ok(!highlightCheatCode('echo '.repeat(14000),'bash').includes('<span'),'Oversized examples must bypass parsing');
  assert.match(renderCheatBlocks([{type:'quote',blocks:[{type:'paragraph',text:'`\\d+`'}]}],'regex'),/reference-syntax-string/,'Inline patterns inherit the topic through nested blocks');
  for(const topic of data.topics){const html=renderCheatBlocks(topic.sections.flatMap(section=>section.blocks),topic.id);assert.match(html,/reference-syntax-/,topic.id+' complete source must render highlighted examples');}
  const emoji=JSON.parse(await fs.readFile('src/renderer/reference-data/emoji.json','utf8'));
  assert.equal(emoji.length,3944);
  assert.ok(emoji.some(([glyph])=>glyph==='👍🏿')&&emoji.some(([glyph])=>glyph==='🧑🏻'));
  for(const name of ['reference-emoji-worker.js','emoji-atlas/sheet-00.png','emoji-atlas/../app.js','katex-fonts/../../main/index.cjs'])assert.equal(rendererAssetAllowed('main',name),false);
  console.log('Pinned complete QuickRef documents, safe JSON rendering and 3,944 Unicode emoji sequences passed.');
 }finally{await work.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
