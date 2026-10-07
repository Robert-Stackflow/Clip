import {recordRemoval} from './record-motion';
import {keyedMarkup,setMarkup,clearMarkup,retainListScroll} from './markup';
import './locale';
import './appearance';
import './quick.css';
import './date-picker.css';
import {quickFilters} from './quick-filters';
import {Clipboard,FileText,Link,Code,SlidersHorizontal,Smile,Text,Hash,Pin,Star,Trash2,Copy,Folder,MessageSquare,Image,Plus,CornerDownLeft} from 'lucide';
import {q,icon,iconButton,registerIcons} from './ui';
import {windowCloseButton} from './chrome';
import {setSearchFieldValue} from './one-search';
import {mountEmojiFont} from './emoji-font';
import {appIdentity,hydrateAppIcons} from './source-apps';
import {transientNotice} from './feedback';
import {quickCatalog,quickGroupLabel,type QuickEntry} from './quick-catalog';
import {quickDialog} from './quick-dialog';
import {HISTORY_CLEAR_DETAIL} from '../shared/history-clear';
import {t as tr} from '../shared/i18n';
import {trayQuery,type TrayQuery} from '../shared/tray';
import type {GlyphTab,QuickState,QuickReplyState,QuickReplyItem} from '../shared/quick-panel';

registerIcons({'file-text':FileText,link:Link,code:Code,filter:SlidersHorizontal,clipboard:Clipboard,smile:Smile,text:Text,hash:Hash,pin:Pin,star:Star,trash:Trash2,copy:Copy,folder:Folder,reply:MessageSquare,image:Image,plus:Plus,enter:CornerDownLeft});
const api=window.clipperQuick,search=q<HTMLInputElement>('quick-search'),content=q('quick-content'),categories=q('quick-categories'),tabs=q('quick-tabs');
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const tabNames=[['clipboard',tr('剪贴板')],['replies',tr('快捷回复')],['emoji','Emoji'],['kaomoji',tr('颜文字')],['symbols',tr('符号')]];
q('window-actions').innerHTML=windowCloseButton('quick');
q('search-icon').innerHTML=icon('search');
document.querySelector('.search-clear')!.innerHTML=icon('close');
q('quick-clear-history').innerHTML=icon('lucide:trash');
q('quick-new-reply').innerHTML=icon('lucide:plus')+'<span>'+tr('新建回复')+'</span>';
q('quick-new-reply').setAttribute('aria-label',tr('新建回复'));
tabs.innerHTML=tabNames.map(([id,label])=>`<button id="quick-tab-${id}" type="button" role="tab" aria-controls="quick-content" aria-selected="${id==='clipboard'}" data-tab="${id}"><span>${label}</span></button>`).join('');
mountEmojiFont(content);
let tab:'clipboard'|'replies'|GlyphTab='clipboard',group='all',state:QuickState|undefined,replies:QuickReplyState|undefined,visibleGlyphs:QuickEntry[]=[],active=!api.onSession,busy=false,revision=0,session=new AbortController();
let timer:ReturnType<typeof setTimeout>|undefined;
const feedback=transientNotice(q('quick-notice'));
const notice=(value:unknown)=>{q('quick-notice').hidden=false;feedback(value);};
const filters=quickFilters(q<HTMLButtonElement>('quick-filter'),()=>{content.scrollTop=0;void load();},()=>hideHover(true));
let hoverTimer:ReturnType<typeof setTimeout>|undefined,hoverRow='';
function hideHover(immediate=false){clearTimeout(hoverTimer);hoverRow='';void api.hover?.(null,undefined,immediate).catch(()=>{});}
function hover(article:HTMLElement){
 if(!active||busy||tab!=='clipboard'||hoverRow===article.dataset.id||document.querySelector(':popover-open,dialog[open]'))return;
 hideHover();hoverRow=article.dataset.id!;const token=article.dataset.token!,version=revision;
 hoverTimer=setTimeout(()=>{if(!article.isConnected||!article.matches(':hover')||version!==revision||!active||busy)return;const row=article.getBoundingClientRect(),viewport=content.getBoundingClientRect(),left=Math.max(row.left,viewport.left),top=Math.max(row.top,viewport.top),right=Math.min(row.right,viewport.right),bottom=Math.min(row.bottom,viewport.bottom);if(right>left&&bottom>top)void api.hover?.(token,{left,top,width:right-left,height:bottom-top}).catch(()=>{});},180);
}
content.addEventListener('scroll',()=>hideHover(true),{passive:true});
const query=():TrayQuery=>({...trayQuery,text:search.value,kind:'all',category:group==='all'?'':group,filters:filters.value});
function run(action:()=>Promise<unknown>){if(!active||busy)return;hideHover(true);filters.close();const signal=session.signal;busy=true;content.setAttribute('aria-busy','true');void action().catch(error=>{if(active&&!signal.aborted)notice(error);}).finally(()=>{if(!signal.aborted){busy=false;content.removeAttribute('aria-busy');}});}
function empty(label:string,hint='',retry=false){setMarkup(content,`<div class="quick-empty">${icon(tab==='clipboard'?'lucide:clipboard':'search')}<strong>${esc(label)}</strong>${hint?`<span>${esc(hint)}</span>`:''}${retry?`<button id="quick-retry" type="button">${tr('重试')}</button>`:''}</div>`);q('quick-retry')?.addEventListener('click',()=>void load());}
function renderCategories(){
 categories.hidden=tab==='replies'||tab==='clipboard'&&!state?.categories.length;q('quick-clear-history').hidden=tab!=='clipboard';q('quick-filter').hidden=tab!=='clipboard';q('quick-new-reply').hidden=tab!=='replies';
 categories.classList.toggle('tabs',tab==='clipboard');
 const choices=tab==='replies'?[]:tab==='clipboard'?[['all',tr('全部')],...(state?.categories||[]).map(category=>[category.id,category.name])]:[['recent',tr('最近使用')],['all',tr('全部')],...[...new Set(quickCatalog(tab).map(item=>item.group))].map(value=>[value,quickGroupLabel(value)])];
 categories.innerHTML=choices.map(([value,label])=>`<button type="button" data-group="${esc(value)}" aria-pressed="${group===value}" class="${group===value?'selected':''}">${esc(label)}</button>`).join('');
 categories.querySelectorAll<HTMLButtonElement>('[data-group]').forEach(button=>button.onclick=()=>{group=button.dataset.group!;content.scrollTop=0;renderCategories();if(tab==='clipboard')void load();else renderGlyphs();});
}
const previews=new Map<string,string>(),imageQueue:{image:HTMLImageElement;token:string;key:string;version:number}[]=[];let jobs=0;
const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){const image=entry.target as HTMLImageElement;observer.unobserve(image);imageQueue.push({image,token:image.dataset.token!,key:image.dataset.key!,version:revision});pumpImages();}},{root:content,rootMargin:'100px'});
function pumpImages(){
 while(jobs<3&&imageQueue.length){const job=imageQueue.shift()!;if(!active||job.version!==revision||!job.image.isConnected)continue;const cached=previews.get(job.key);if(cached){job.image.src=cached;continue;}jobs++;
  void api.preview(job.token).then(value=>{if(active&&job.version===revision&&job.image.isConnected&&value.image){previews.set(job.key,value.image);job.image.src=value.image;}}).catch(()=>{}).finally(()=>{jobs--;pumpImages();});
 }
}
function renderRecords(animate=false){
 const remaining=new Set(state?.items.map(item=>item.id)),motion=animate?recordRemoval(content,'.quick-record',row=>!remaining.has(row.dataset.id!)):()=>{},restoreScroll=retainListScroll(content,'.quick-record:not(.record-removal-ghost)');
 observer.disconnect();imageQueue.length=0;
 if(!state?.items.length){empty(search.value?tr('没有匹配记录'):tr('暂无剪贴板记录'),search.value?tr('尝试其他关键词'):tr('复制内容后会显示在这里'));motion();return;}
 keyedMarkup(content,state.items.map(item=>({key:item.id,html:`<article class="quick-record" data-pinned="${item.pinned}" data-favorite="${item.favorite}" data-id="${item.id}" data-token="${item.token}"><button type="button" class="quick-record-main" data-use="${item.token}" aria-label="${esc(item.title)}">${item.kind==='image'?`<img data-token="${item.token}" data-key="${item.previewKey}" alt="${tr('剪贴板图片')}"${previews.has(item.previewKey)?` src="${esc(previews.get(item.previewKey))}"`:''}>`:item.kind==='files'?icon('lucide:folder'):''}${item.kind!=='image'?`<span>${esc(item.preview||item.title)}</span>`:''}</button><div class="quick-record-footer"><div class="quick-record-meta">${appIdentity(item.source)}<span>${esc(item.source.replace(/\.exe$/i,''))}</span></div><div class="quick-record-actions" data-motion-appearance>${iconButton('',tr('复制'),'lucide:copy')}${iconButton('',item.pinned?tr('取消置顶'):tr('置顶'),'lucide:pin',item.pinned)}${iconButton('',item.favorite?tr('取消收藏'):tr('收藏'),'lucide:star',item.favorite)}${iconButton('',tr('删除记录'),'lucide:trash')}</div></div></article>`})));restoreScroll();
 for(const article of content.querySelectorAll<HTMLElement>('.quick-record:not(.record-removal-ghost)')){article.onpointerenter=event=>{if(event.pointerType!=='touch')hover(article);};article.onpointermove=event=>{if(event.pointerType!=='touch')hover(article);};article.onpointerleave=()=>hideHover();const token=article.dataset.token!,button=article.querySelector<HTMLButtonElement>('[data-use]')!;button.onclick=()=>run(()=>api.use(token,!!state?.canPaste));button.oncontextmenu=event=>{event.preventDefault();run(()=>api.use(token,false));};const actions=article.querySelectorAll<HTMLButtonElement>('.quick-record-actions button');actions.forEach((node,index)=>node.onclick=()=>run(async()=>{if(index===0)await api.use(token,false);else{await api.action(token,(['pin','favorite','delete'] as const)[index-1]);await load(true);}}));}
 for(const image of content.querySelectorAll<HTMLImageElement>('.quick-record:not(.record-removal-ghost) img[data-token]')){const cached=previews.get(image.dataset.key!);if(cached){if(image.getAttribute('src')!==cached)image.src=cached;}else{image.removeAttribute('src');observer.observe(image);}}
 motion();void hydrateAppIcons(content,api.appIcons);
}
function chooseReply(item:QuickReplyItem,paste:boolean){run(async()=>{
 const signal=session.signal;
 if(!item.variables.length){await api.reply(item.token,paste);return;}
 await quickDialog(tr('填写模板'),item.variables.map((name,index)=>`<label class="field">${esc(name)}<input name="reply-${index}" maxlength="10000" required></label>`).join(''),paste?tr('粘贴'):tr('复制'),async form=>{
  if(signal.aborted)return;const values=Object.fromEntries(item.variables.map((name,index)=>[name,form.querySelector<HTMLInputElement>(`[name="reply-${index}"]`)!.value]));await api.reply(item.token,paste,values);
 },signal);
});}
function renderReplies(){
 observer.disconnect();imageQueue.length=0;content.scrollTop=0;
 if(!replies?.items.length){empty(search.value?tr('没有匹配内容'):tr('暂无快捷回复'),search.value?tr('尝试其他关键词'):tr('点击“新建回复”添加'));return;}
 setMarkup(content,replies.items.map(item=>`<article class="quick-record quick-reply"><button type="button" class="quick-record-main" data-reply="${item.token}" aria-label="${esc(item.title)}"><span class="quick-reply-body"><strong>${esc(item.title)}</strong>${item.thumbnail?`<img src="${esc(item.thumbnail)}" alt="${esc(item.title)}">`:item.preview?`<span class="quick-reply-preview">${esc(item.preview)}</span>`:''}</span></button><div class="quick-reply-commands"><button type="button" data-reply-paste aria-label="${tr('粘贴')}" title="${tr('粘贴')}" ${replies?.canPaste?'':'disabled'}>${icon('lucide:enter')}</button><button type="button" data-reply-copy aria-label="${tr('复制')}" title="${tr('复制')}">${icon('lucide:copy')}</button></div></article>`).join(''));
 for(const item of replies.items){const button=content.querySelector<HTMLButtonElement>(`[data-reply="${item.token}"]`)!;button.onclick=()=>chooseReply(item,!!replies?.canPaste);button.oncontextmenu=event=>{event.preventDefault();chooseReply(item,false);};const card=button.closest('article')!;card.querySelector<HTMLButtonElement>('[data-reply-copy]')!.onclick=()=>chooseReply(item,false);card.querySelector<HTMLButtonElement>('[data-reply-paste]')!.onclick=()=>chooseReply(item,true);}
}
async function load(animate=false){
 clearTimeout(timer);
 if(!active)return;hideHover(true);const version=++revision;observer.disconnect();imageQueue.length=0;content.setAttribute('aria-busy','true');
 if((tab==='clipboard'||tab==='replies')&&!content.querySelector('.quick-record')){setMarkup(content,Array.from({length:4},()=>'<div class="quick-skeleton" aria-hidden="true"><i></i><i></i></div>').join(''));}
 try{if(tab==='replies'){const result=await api.replies(search.value);if(!active||version!==revision)return;replies=result;document.documentElement.dataset.theme=result.dark?'dark':'light';renderReplies();}else{const result=await api.state(query());if(!active||version!==revision)return;state=result;renderCategories();filters.update(state);document.documentElement.dataset.theme=state.dark?'dark':'light';if(tab==='clipboard')renderRecords(animate);else renderGlyphs();}}
 catch(error){if(active&&version===revision&&group!=='all'&&String(error).includes('CLIPPER_TRAY_CATEGORY_MISSING')){group='all';void load();return;}if(active&&version===revision){empty(tr('暂时无法加载'),tr('请重试'),true);notice(error);}}
 finally{if(version===revision)content.removeAttribute('aria-busy');}
}
function renderGlyphs(){
 if(tab==='clipboard'||tab==='replies')return;const term=search.value.trim().toLocaleLowerCase(),all=quickCatalog(tab),recent=state?.recent.filter(item=>item.tab===tab)||[];
 const items=group==='recent'?recent.map(item=>all.find(entry=>entry.glyph===item.text)||{glyph:item.text,title:item.text,group:'recent',search:item.text.toLocaleLowerCase()}):all;
 visibleGlyphs=items.filter(item=>(group==='all'||group==='recent'||item.group===group)&&(!term||item.search.includes(term)));
 if(!visibleGlyphs.length)empty(group==='recent'?tr('还没有最近使用的内容'):tr('没有匹配内容'),group==='recent'?tr('选择一次，下次就能在这里找到'):tr('尝试其他关键词'));
 else setMarkup(content,`<div class="quick-glyph-grid" data-kind="${tab}">${visibleGlyphs.map((item,index)=>`<button type="button" data-glyph="${index}" title="${esc(item.title)}" aria-label="${esc(item.title)}">${esc(item.glyph)}</button>`).join('')}</div>`);
 content.querySelectorAll<HTMLButtonElement>('[data-glyph]').forEach(button=>{const choose=(paste:boolean)=>run(()=>api.text({tab:tab as GlyphTab,text:visibleGlyphs[Number(button.dataset.glyph)].glyph},paste));button.onclick=()=>choose(!!state?.canPaste);button.oncontextmenu=event=>{event.preventDefault();choose(false);};});
}
function switchTab(value:typeof tab){
 if(busy)return;hideHover(true);filters.close();revision++;observer.disconnect();imageQueue.length=0;tab=value;group='all';setSearchFieldValue(search,'');content.scrollTop=0;q('quick-toolbar').dataset.tab=tab;
 tabs.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.tab===tab)));
 search.placeholder=tr(tab==='clipboard'?'搜索剪贴板':tab==='replies'?'搜索快捷回复':tab==='emoji'?'搜索表情':tab==='kaomoji'?'搜索颜文字':'搜索符号');content.setAttribute('aria-labelledby','quick-tab-'+tab);renderCategories();void load();
}
tabs.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button=>button.onclick=()=>switchTab(button.dataset.tab as typeof tab));
categories.addEventListener('wheel',event=>{if(categories.scrollWidth>categories.clientWidth&&event.deltaY&&!event.deltaX){event.preventDefault();categories.scrollLeft+=event.deltaY;}},{passive:false});
search.oninput=()=>{hideHover(true);content.scrollTop=0;clearTimeout(timer);timer=setTimeout(()=>{if(!active||busy)return;if(tab==='clipboard'||tab==='replies')void load();else renderGlyphs();},150);};
search.onkeydown=event=>{if(event.key==='ArrowDown'){event.preventDefault();content.querySelector<HTMLButtonElement>('[data-use],[data-reply],[data-glyph]')?.focus();}else if(event.key==='Enter'){event.preventDefault();content.querySelector<HTMLButtonElement>('[data-use],[data-reply],[data-glyph]')?.click();}};
content.onkeydown=event=>{const buttons=Array.from(content.querySelectorAll<HTMLButtonElement>('[data-use],[data-reply],[data-glyph]')),index=buttons.indexOf(document.activeElement as HTMLButtonElement);if(index<0)return;const columns=tab==='clipboard'||tab==='replies'?1:tab==='kaomoji'?3:7,delta=event.key==='ArrowDown'?columns:event.key==='ArrowUp'?-columns:event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0;if(delta){event.preventDefault();const next=buttons[Math.max(0,Math.min(buttons.length-1,index+delta))];next.focus();next.scrollIntoView({block:'nearest'});}};
document.addEventListener('keydown',event=>{if(event.defaultPrevented)return;if(event.key==='Escape'){event.preventDefault();void api.hide();}else if(event.ctrlKey&&event.key.toLowerCase()==='f'){event.preventDefault();search.focus();}});
q('quick-close').onclick=()=>void api.hide();
q('quick-new-reply').onclick=()=>run(async()=>{
 const signal=session.signal,saved=await quickDialog(tr('新建回复'),`<label class="field">${tr('标题')}<input name="title" maxlength="120" required data-required-message="${tr('请输入标题')}"></label><label class="field">${tr('回复内容')}<textarea name="text" rows="5" maxlength="1000000" required data-required-message="${tr('请输入回复内容')}" placeholder="${tr('输入回复内容，可使用 {{变量}}')}"></textarea></label>`,tr('保存'),async form=>{if(!signal.aborted)await api.createReply({title:form.querySelector<HTMLInputElement>('[name=title]')!.value,text:form.querySelector<HTMLTextAreaElement>('[name=text]')!.value});},signal);
 if(saved&&active&&!signal.aborted){setSearchFieldValue(search,'');await load();notice(tr('快捷回复已添加'));}
});
document.addEventListener('pointerdown',event=>{
 if(event.button!==0||!active||busy||document.querySelector('dialog[open],:popover-open'))return;const target=event.target as Element;if(target.closest('button,input,textarea,select,a,[role=combobox]'))return;
 const bounds=content.getBoundingClientRect();if(target===content&&event.clientX>=bounds.left+content.clientWidth)return;
 event.preventDefault();hideHover(true);void api.move?.().catch(notice);
});
q('quick-clear-history').onclick=()=>run(async()=>{
 const signal=session.signal,saved=await quickDialog(tr('清空历史？'),`<p>${esc(tr(HISTORY_CLEAR_DETAIL))}</p>`,tr('清空历史'),async()=>{if(!signal.aborted)await api.clear();},signal);
 if(saved&&active&&!signal.aborted){await load(true);notice(tr('历史已清空，置顶和收藏已保留'));}
});
api.onNotice(text=>notice(text));api.onChange(()=>{clearTimeout(timer);timer=setTimeout(()=>{if(active&&!busy)void load(true);},100);});
api.onSession?.(open=>{hideHover(true);filters.reset();session.abort();session=new AbortController();active=open;revision++;clearTimeout(timer);observer.disconnect();imageQueue.length=0;previews.clear();state=undefined;replies=undefined;busy=false;clearMarkup(content);content.replaceChildren();q('quick-notice').textContent='';if(open){switchTab('clipboard');search.focus();}else setSearchFieldValue(search,'');});
renderCategories();if(active)void load();else setMarkup(content,Array.from({length:4},()=>'<div class="quick-skeleton" aria-hidden="true"><i></i><i></i></div>').join(''));
