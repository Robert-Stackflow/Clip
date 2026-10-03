import {Marked} from 'marked';
import katex from 'katex';
import type {CheatTopic,CheatSection,CheatBlock} from './cheatsheet-data';
import {tx} from './reference-catalog';
import {highlightCheatCode} from './cheatsheet-highlight';
const esc=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const math=(text:string,displayMode=false)=>katex.renderToString(text,{displayMode,throwOnError:false,trust:false,strict:'ignore',maxExpand:1000});
const parsers=new Map<string,Marked>();
function inline(text:string,language:string){
 let parser=parsers.get(language);if(!parser){parser=new Marked({gfm:true,renderer:{
 html({text}){return text.startsWith('<!--')?'':/^<\/?pur\s*>$/i.test(text)?'':/^<br\s*\/?\s*>$/i.test(text)?'<br>':esc(text);},
 image({text,href}){return `<span class="reference-image-note">${esc(text||href)}</span>`;},
 codespan({text}){const formula=text.match(/^katex:(.*)$/is);return formula?`<button type="button" class="reference-formula" data-code="${esc(formula[1])}" aria-label="${esc(formula[1])}">${math(formula[1])}</button>`:`<button type="button" class="reference-inline-code" data-code="${esc(text)}" title="${tx('点击复制','Click to copy')}"><code>${highlightCheatCode(text,language)}</code></button>`;},
 link({href,tokens}){let url;try{url=new URL(href,'https://quickref.cn/docs/');}catch{return this.parser.parseInline(tokens);}return href.startsWith('#')?`<a href="${esc(href)}">${this.parser.parseInline(tokens)}</a>`:url.protocol==='https:'?`<a href="${esc(url.href)}">${this.parser.parseInline(tokens)}</a>`:this.parser.parseInline(tokens);}
}});parsers.set(language,parser);}
 return parser.parseInline(text,{async:false});
}
// Render our structured JSON blocks; only inline Markdown is parsed for text styling.
export function renderCheatBlocks(blocks:CheatBlock[],language=''):string{return blocks.map(block=>{
 switch(block.type){
  case 'paragraph':return `<p>${inline(block.text,language)}</p>`;
  case 'code':{const preview=/^katex$/i.test(block.language)?`<div class="reference-math-preview">${math(block.text,true)}</div>`:'';return `${preview}<div class="reference-code-block"><div class="reference-code-caption"><span>${esc(block.language)}</span><button type="button" class="reference-code-copy" data-code="${esc(block.text)}">${tx('复制','Copy')}</button></div><pre><code>${highlightCheatCode(block.text,block.language||language)}</code></pre></div>`;}
  case 'table':return `<div class="reference-table-wrap"><table><thead><tr>${block.header.map(cell=>`<th>${inline(cell,language)}</th>`).join('')}</tr></thead><tbody>${block.rows.map(row=>`<tr>${row.map(cell=>`<td>${inline(cell,language)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  case 'list':{const tag=block.ordered?'ol':'ul';return `<${tag}${block.ordered?` start="${block.start}"`:''}>${block.items.map(item=>`<li>${renderCheatBlocks(item,language)}</li>`).join('')}</${tag}>`;}
  case 'quote':return `<blockquote>${renderCheatBlocks(block.blocks,language)}</blockquote>`;
  case 'divider':return '<hr>';
 }
}).join('');}
export function filterCheatSections(topic:CheatTopic,query:string):CheatSection[]{const term=query.trim().toLocaleLowerCase();return topic.sections.filter(section=>!term||`${section.name} ${section.group} ${section.markdown}`.toLocaleLowerCase().includes(term));}
export function mountCheatDocument(results:HTMLElement,scroll:HTMLElement,topic:CheatTopic,sections:CheatSection[]){
 results.className='reference-results reference-cheats';results.style.height='';
 results.innerHTML=`<header class="reference-topic-heading"><div><h2>${esc(topic.label)}</h2><p>${tx('Quick Reference 完整速查表','Complete Quick Reference cheatsheet')}</p></div><a href="${esc(topic.source)}">QuickRef ↗</a></header>`+sections.map(section=>`<section class="reference-cheat-section" data-section="${section.id}"><header><small>${esc(section.group===section.name?'':section.group)}</small><h3>${esc(section.name)}</h3></header><div class="reference-cheat-content" data-body="${section.id}"></div></section>`).join('');
 // Headings exist immediately for smooth contents navigation. Heavy tables/math are rendered near the viewport.
 const rendered=new Set<string>(),byId=new Map(sections.map(section=>[section.id,section]));
 const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)render(entry.target as HTMLElement);},{root:scroll,rootMargin:'500px'});
 function render(node:HTMLElement){const id=node.dataset.section!;if(rendered.has(id))return;rendered.add(id);const body=node.querySelector<HTMLElement>('[data-body]')!;body.innerHTML=renderCheatBlocks(byId.get(id)!.blocks,topic.id);body.style.minHeight='';observer.unobserve(node);}
 for(const node of results.querySelectorAll<HTMLElement>('[data-section]')){const section=byId.get(node.dataset.section!)!;node.querySelector<HTMLElement>('[data-body]')!.style.minHeight=Math.min(2400,Math.max(70,section.markdown.split('\n').length*18))+'px';observer.observe(node);}
 return {ensure:(id:string)=>{const node=results.querySelector<HTMLElement>(`[data-section="${id}"]`);if(node)render(node);},dispose:()=>observer.disconnect()};
}
