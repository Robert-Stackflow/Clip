// Explicit source refresh only: builds and the app remain completely offline.
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {marked} from 'marked';
const root='src/renderer/reference-data';
async function get(url){let error;for(let attempt=0;attempt<6;attempt++){try{const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`${response.status}: ${url}`);return await response.text();}catch(e){error=e;}}throw error;}
const revision=process.argv[2]||JSON.parse(await get('https://api.github.com/repos/jaywcjlove/reference/commits/main')).sha;
if(!/^[a-f0-9]{40}$/.test(revision))throw new Error('A full upstream commit is required');
const source=async path=>{const data=JSON.parse(await get(`https://api.github.com/repos/jaywcjlove/reference/contents/${path}?ref=${revision}`));if(data.encoding!=='base64')throw new Error(`Missing source ${path}`);return Buffer.from(data.content,'base64').toString('utf8');};
const topics=[['git','Git'],['latex','LaTeX'],['bash','Bash'],['linux-command','Linux'],['regex','Regex']];
const sources=await Promise.all(topics.map(async([name,label])=>({name,label,markdown:await source(`docs/${name}.md`)})));
const license=await source('LICENSE');
if(!license.startsWith('MIT License'))throw new Error('Review upstream license before importing');
await mkdir('work/quickref-source',{recursive:true});
for(const source of sources){await writeFile(`work/quickref-source/${source.name}.md`,source.markdown);console.log(source.name,source.markdown.length,source.markdown.split('\n').length);}
await writeFile('work/quickref-source/revision.txt',revision);
await writeFile(root+'/QUICKREF-LICENSE.txt',license);
// Keep the entire upstream document verbatim for provenance and lossless refresh.
function blocks(tokens){return tokens.flatMap(token=>{
 if(token.type==='space'||token.type==='def')return [];
 if(token.type==='code')return [{type:'code',language:token.lang||'',text:token.text}];
 if(token.type==='table')return [{type:'table',header:token.header.map(cell=>cell.text),rows:token.rows.map(row=>row.map(cell=>cell.text))}];
 if(token.type==='list')return [{type:'list',ordered:token.ordered,start:token.start||1,items:token.items.map(item=>blocks(item.tokens))}];
 if(token.type==='blockquote')return [{type:'quote',blocks:blocks(token.tokens)}];
 if(token.type==='hr')return [{type:'divider'}];
 if(token.type==='html'&&token.text.startsWith('<!--'))return [];
 return [{type:'paragraph',text:token.text||token.raw}];
 });}
function sections(markdown){const sections=[];let group='',current={id:'intro',name:'介绍',group:'',markdown:''};for(const token of marked.lexer(markdown)){if(token.type==='heading'){if(current.markdown.trim())sections.push(current);if(token.depth===1){current={id:'intro',name:'介绍',group:'',markdown:''};continue;}if(token.depth===2)group=token.text;current={id:`section-${sections.length}`,name:token.text,group,markdown:''};}else current.markdown+=token.raw;}if(current.markdown.trim())sections.push(current);return sections.map((section,index)=>{let items=0;const tokens=marked.lexer(section.markdown);marked.walkTokens(tokens,token=>{if(token.type==='code')items++;if(token.type==='table')items+=token.rows.length;});return {...section,id:`section-${index}`,items,blocks:blocks(tokens)};});}
const data={schemaVersion:1,repository:'https://github.com/jaywcjlove/reference',revision,license:'MIT',topics:sources.map(({name,label,markdown})=>({id:name==='linux-command'?'linux':name,label,source:`https://quickref.cn/docs/${name}.html`,sha256:createHash('sha256').update(markdown).digest('hex'),markdown,sections:sections(markdown)}))};
await writeFile(root+'/cheatsheets.json',JSON.stringify(data,null,2)+'\n');
const links=new Set(data.topics.map(topic=>topic.source));
for(const topic of data.topics)marked.walkTokens(marked.lexer(topic.markdown),token=>{if(token.type==='link'&&!token.href.startsWith('#')){try{const url=new URL(token.href,'https://quickref.cn/docs/');if(url.protocol==='https:')links.add(url.href);}catch{}}});
await writeFile(root+'/reference-links.json',JSON.stringify([...links].sort(),null,2)+'\n');
console.log('Imported',revision);
