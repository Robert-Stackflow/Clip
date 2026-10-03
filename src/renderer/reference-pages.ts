import emoji from './reference-data/emoji.json';
import symbols from './reference-data/symbols.json';
import entities from './reference-data/entities.json';
import mime from './reference-data/mime.json';
import colors from './reference-data/colors.json';
import {cheatTopics} from './cheatsheet-data';
import {interfaceLanguage,formatNumber} from '../shared/i18n';

type Entry={glyph:string;title:string;detail:string;group:string;copy:string;secondary?:string;color?:string};
const en=()=>interfaceLanguage()==='en';
const tx=(zh:string,english:string)=>en()?english:zh;
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const kaomojiGroups:Record<string,string[]>={
 '开心':['(＾▽＾)','(≧▽≦)','(๑˃ᴗ˂)ﻭ','(｡♥‿♥｡)','(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧','ヽ(・∀・)ﾉ','(⌒▽⌒)☆','٩(◕‿◕｡)۶','(￣▽￣)ノ','(｡•̀ᴗ-)✧','(๑>◡<๑)','(*^▽^*)','(≧◡≦)','(ﾉ´ヮ`)ﾉ*: ･ﾟ','(✿◠‿◠)'],
 '喜欢':['(づ｡◕‿‿◕｡)づ','(づ￣ ³￣)づ','(っ˘з(˘⌣˘ )','(♡°▽°♡)','( ˘ ³˘)♥','(♥ω♥*)','(｡･ω･｡)ﾉ♡','(◍•ᴗ•◍)❤','(≧◡≦) ♡','♡(˃͈ દ ˂͈ ༶ )','(っ´▽｀)っ','(๑♡⌓♡๑)'],
 '惊讶':['(⊙_⊙)','(°ロ°) !','Σ(°△°|||)','(☉_☉)','(ﾟДﾟ;)','(　ﾟдﾟ)','(◎_◎;)','(ʘᗩʘ\')','(O_O;)','(・o・)'],
 '难过':['(╥_╥)','(ಥ_ಥ)','(T_T)','(；ω；)','(｡•́︿•̀｡)','(ノ_<。)','(つ﹏⊂)','(இ﹏இ)','(ಥ﹏ಥ)','(｡╯︵╰｡)'],
 '生气':['(╬ಠ益ಠ)','(ノಠ益ಠ)ノ彡┻━┻','(＃`Д´)','(ง •̀_•́)ง','(╯°□°）╯︵ ┻━┻','(¬_¬)','(눈_눈)','(ಠ_ಠ)','( •̀ω•́ )'],
 '动作':['(づ￣ ³￣)づ','ヽ(•‿•)ノ','┬─┬ノ( º _ ºノ)','(☞ﾟヮﾟ)☞','☜(ﾟヮﾟ☜)','(ง\'̀-\'́)ง','(っ•̀ω•́)っ','＼(￣▽￣)／','(ﾉﾟ0ﾟ)ﾉ~','(〜￣▽￣)〜','(￣ー￣)ゞ','( _ _ ).｡o○'],
 '动物':['ʕ•ᴥ•ʔ','ฅ^•ﻌ•^ฅ','(=^･ω･^=)','U・ᴥ・U','(ᵔᴥᵔ)','(=｀ω´=)','(◕ᴥ◕)','(=^‥^=)','/ᐠ｡ꞈ｡ᐟ\\','ʕっ•ᴥ•ʔっ']
};
const asciiNames=['NUL','SOH','STX','ETX','EOT','ENQ','ACK','BEL','BS','HT','LF','VT','FF','CR','SO','SI','DLE','DC1','DC2','DC3','DC4','NAK','SYN','ETB','CAN','EM','SUB','ESC','FS','GS','RS','US'];
const catalog:Record<string,{label:string;source:string;items:Entry[]}>= {
 emoji:{label:'Emoji',source:'https://www.unicode.org/Public/emoji/latest/emoji-test.txt',items:(emoji as string[][]).map(([glyph,title,group,subgroup])=>({glyph,title,detail:subgroup,group,copy:glyph}))},
 kaomoji:{label:tx('颜文字','Kaomoji'),source:'',items:Object.entries(kaomojiGroups).flatMap(([group,values])=>values.map(glyph=>({glyph,title:group,detail:'',group,copy:glyph})))},
 symbols:{label:tx('符号','Symbols'),source:'https://www.unicode.org/Public/UCD/latest/ucd/UnicodeData.txt',items:(symbols as string[][]).map(([glyph,title,group,code])=>({glyph,title,detail:'U+'+code,group,copy:glyph}))},
 entities:{label:tx('HTML 实体','HTML entities'),source:'https://html.spec.whatwg.org/entities.json',items:(entities as string[][]).map(([title,glyph])=>({glyph,title,detail:glyph,group:title.slice(1,2).toUpperCase(),copy:glyph,secondary:title}))},
 colors:{label:tx('命名颜色','Named Colors'),source:'https://www.w3.org/TR/css-color-4/#named-colors',items:(colors as string[][]).map(([title,color])=>({glyph:'',title,detail:color.toUpperCase(),group:title.slice(0,1).toUpperCase(),copy:color,secondary:title,color}))},
 mime:{label:'MIME',source:'https://www.iana.org/assignments/media-types/',items:(mime as string[]).map(value=>({glyph:'',title:value,detail:'',group:value.split('/')[0],copy:value}))},
 ascii:{label:'ASCII',source:'https://www.rfc-editor.org/rfc/rfc20',items:Array.from({length:128},(_,code)=>({glyph:code<32?asciiNames[code]:code===127?'DEL':String.fromCharCode(code),title:code<32?asciiNames[code]:code===32?'SPACE':code===127?'DEL':String.fromCharCode(code),detail:`${code} · 0x${code.toString(16).toUpperCase().padStart(2,'0')} · ${code.toString(2).padStart(8,'0')}`,group:code<32||code===127?'Control':code<48?'Punctuation':code<58?'Digits':code<65?'Punctuation':code<91?'Uppercase':code<97?'Punctuation':code<123?'Lowercase':'Punctuation',copy:code<32||code===127?'\\x'+code.toString(16).toUpperCase().padStart(2,'0'):String.fromCharCode(code)}))}
};
const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);}catch{const field=document.createElement('textarea');field.value=value;field.style.position='fixed';field.style.opacity='0';document.body.append(field);try{field.select();if(!document.execCommand('copy'))throw new Error('Clipboard unavailable');}finally{field.remove();}}};
const searchText=(value:string)=>value.toLocaleLowerCase();
const tab=(id:string,label:string,active:boolean)=>`<button type="button" class="reference-tab${active?' active':''}" data-tab="${id}" aria-pressed="${active}">${esc(label)}</button>`;

export function mountReference(root:HTMLElement,kind:'symbols'|'cheats',notify:(text:string)=>void){
 let active=kind==='symbols'?'emoji':'git',query='',group='',limit=120;
 const tabs=kind==='symbols'?Object.entries(catalog).map(([id,value])=>[id,value.label]):cheatTopics.map(topic=>[topic.id,topic.label]);
 root.innerHTML=`<section class="reference-page"><header class="reference-heading"><div><h1>${kind==='symbols'?tx('表情符号','Symbols & Emoji'):'CheetSheet'}</h1><p>${kind==='symbols'?tx('搜索、预览并复制字符与常用代码','Search, preview, and copy characters and codes'):tx('随手可查的命令与语法，点击即可复制','Commands and syntax at hand. Click to copy.')}</p></div></header><div class="reference-tabs" role="group" aria-label="${tx('资料分类','Reference categories')}">${tabs.map(([id,label])=>tab(id,label,id===active)).join('')}</div><div class="reference-toolbar"><label class="reference-search"><span aria-hidden="true">⌕</span><input type="search" id="reference-search" autocomplete="off" placeholder="${tx('搜索名称、字符或代码','Search names, characters, or codes')}" aria-label="${tx('搜索资料','Search references')}"></label><select id="reference-group" aria-label="${tx('筛选类别','Filter group')}"></select><span id="reference-count" class="reference-count"></span></div><div class="reference-scroll"><div id="reference-results" class="reference-results"></div><button id="reference-more" class="reference-more" type="button" hidden>${tx('显示更多','Show more')}</button><p class="reference-attribution" id="reference-attribution"></p></div></section>`;
 const input=root.querySelector<HTMLInputElement>('#reference-search')!,select=root.querySelector<HTMLSelectElement>('#reference-group')!,results=root.querySelector<HTMLElement>('#reference-results')!,more=root.querySelector<HTMLButtonElement>('#reference-more')!,count=root.querySelector<HTMLElement>('#reference-count')!,attribution=root.querySelector<HTMLElement>('#reference-attribution')!;
 attribution.onclick=event=>{const link=(event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');if(!link)return;event.preventDefault();void window.clipper.openReference(link.href).catch(error=>notify(String(error)));};
 const groups=()=>kind==='symbols'?[...new Set(catalog[active].items.map(item=>item.group))]:cheatTopics.find(topic=>topic.id===active)!.sections.map(section=>section.name);
 const updateGroups=()=>{select.innerHTML=`<option value="">${tx('全部类别','All groups')}</option>`+groups().map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');select.value=group;};
 const render=()=>{
  const term=searchText(query.trim());
  if(kind==='symbols'){
   const source=catalog[active],filtered=source.items.filter(item=>(!group||item.group===group)&&(!term||searchText(`${item.glyph} ${item.title} ${item.detail} ${item.group}`).includes(term)));
   const shown=filtered.slice(0,limit);count.textContent=tx(`${formatNumber(filtered.length)} 项`,` ${formatNumber(filtered.length)} items`);
   results.className='reference-results '+(active==='emoji'||active==='kaomoji'||active==='symbols'?'reference-grid':'reference-list');
   results.innerHTML=shown.map((item,index)=>`<article class="reference-item"><button type="button" class="reference-main" data-copy="${index}" title="${tx('复制','Copy')} ${esc(item.title)}">${item.color?`<i class="reference-swatch" style="background:${item.color}"></i>`:item.glyph?`<span class="reference-glyph">${esc(item.glyph)}</span>`:''}<span class="reference-item-text"><strong>${esc(item.title)}</strong>${item.detail?`<small>${esc(item.detail)}</small>`:''}</span></button>${item.secondary?`<button type="button" class="reference-secondary" data-secondary="${index}" title="${tx('复制代码','Copy code')}">${esc(item.secondary)}</button>`:''}</article>`).join('')||`<div class="reference-empty">${tx('没有匹配的内容','No matching items')}</div>`;
   results.onclick=event=>{const target=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-copy],[data-secondary]');if(!target)return;const item=shown[Number(target.dataset.copy??target.dataset.secondary)];void copy(target.hasAttribute('data-secondary')?item.secondary!:item.copy).then(()=>notify(tx('已复制','Copied'))).catch(error=>notify(String(error)));};
   attribution.innerHTML=source.source?`${tx('数据来源','Source')}: <a href="${source.source}" target="_blank" rel="noopener noreferrer">${esc(new URL(source.source).host)}</a>`:'';
   more.hidden=filtered.length<=limit;
  }else{
   const topic=cheatTopics.find(item=>item.id===active)!;
   const sections=topic.sections.map(section=>({name:section.name,rows:section.rows.filter(([syntax,description])=>(!group||section.name===group)&&(!term||searchText(`${syntax} ${description} ${section.name}`).includes(term)))})).filter(section=>section.rows.length);
   const total=sections.reduce((sum,section)=>sum+section.rows.length,0);count.textContent=tx(`${formatNumber(total)} 条`,` ${formatNumber(total)} entries`);
   let index=0;results.className='reference-results reference-cheats';results.innerHTML=sections.map(section=>`<section class="reference-cheat-section"><h2>${esc(section.name)}</h2><div class="reference-cheat-list">${section.rows.map(([syntax,description])=>`<button type="button" class="reference-cheat-row" data-copy="${index++}"><code>${esc(syntax)}</code><span>${esc(description)}</span><small>${tx('复制','Copy')}</small></button>`).join('')}</div></section>`).join('')||`<div class="reference-empty">${tx('没有匹配的内容','No matching entries')}</div>`;
   const rows=sections.flatMap(section=>section.rows);results.onclick=event=>{const target=(event.target as HTMLElement).closest<HTMLElement>('[data-copy]');if(!target)return;void copy(rows[Number(target.dataset.copy)][0]).then(()=>notify(tx('已复制','Copied'))).catch(error=>notify(String(error)));};
   attribution.innerHTML=`${tx('参考文档','Documentation')}: <a href="${topic.source}" target="_blank" rel="noopener noreferrer">${esc(new URL(topic.source).host)}</a>`;
   more.hidden=true;
  }
 };
 root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button=>button.onclick=()=>{active=button.dataset.tab!;group='';query='';limit=120;input.value='';root.querySelectorAll('[data-tab]').forEach(node=>{const selected=(node as HTMLElement).dataset.tab===active;node.classList.toggle('active',selected);node.setAttribute('aria-pressed',String(selected));});updateGroups();render();root.querySelector('.reference-scroll')!.scrollTop=0;});
 input.oninput=()=>{query=input.value;limit=120;render();};select.onchange=()=>{group=select.value;limit=120;render();};more.onclick=()=>{limit+=120;render();};updateGroups();render();
}
