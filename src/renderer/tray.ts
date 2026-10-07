import {setMarkup,keyedMarkup,patchMarkup,retainListScroll} from './markup';
import {transientNotice} from './feedback';
import {actionFeedback} from './actions';
import './locale';
import {t as tr,formatDate,formatNumber,formatLocale} from '../shared/i18n';
import './appearance';
import './tray.css';
import {createElement,ArrowUpRight,X,FileText,Image,Folder,Link,Code,Star,Pin,type IconNode} from 'lucide';
import {TRAY_CATEGORY_MISSING,trayQuery,type TrayAPI,type TrayQuery,type TrayState,type TrayPreview} from '../shared/tray';
import {appIdentity,hydrateAppIcons} from './source-apps';
declare global{interface Window{clipperTray:TrayAPI}}
const api=window.clipperTray,q=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const previewMeta=document.createElement('div');previewMeta.id='preview-meta';previewMeta.hidden=true;q('preview').after(previewMeta);
function clearPreviewMeta(){previewMeta.replaceChildren();previewMeta.hidden=true;}
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const icons=new Map<IconNode,string>(),recentTime=new Intl.DateTimeFormat(formatLocale(),{hour:'2-digit',minute:'2-digit'});
const icon=(node:IconNode)=>{let html=icons.get(node);if(!html){html=createElement(node,{'aria-hidden':'true','stroke-width':1.75}).outerHTML;icons.set(node,html);}return html;};
const symbols={text:FileText,image:Image,files:Folder,link:Link,code:Code},kinds=[['all',tr('全部')],['text',tr('文字')],['image',tr('图片')],['files',tr('文件')],['link',tr('链接')],['code',tr('代码')]];
let query:TrayQuery={...trayQuery},state:TrayState|undefined,selected='',querySerial=0,previewSerial=0,busy=false,searching=true,dragUntil=0;
let previewValue:TrayPreview|undefined,previewKey='',appliedQuery='',refreshTimer:ReturnType<typeof setTimeout>|undefined,active=!api.onSession;
let hover:ReturnType<typeof setTimeout>|undefined,debounce:ReturnType<typeof setTimeout>|undefined;
const notice=transientNotice(q('notice'));
const run=(action:()=>Promise<unknown>)=>void action().catch(e=>{if(active)notice(e);});
function buttons(){q<HTMLButtonElement>('copy-selected').disabled=!selected||busy||searching;q<HTMLButtonElement>('paste-selected').disabled=!selected||busy||searching||!state?.canPaste;}
function clearPreview(){previewSerial++;clearTimeout(hover);selected='';previewValue=undefined;previewKey='';clearPreviewMeta();setMarkup(q('preview'),tr('<div class="empty">悬停或使用方向键预览</div>'));buttons();}
const skeleton=()=>'<div class="recent-skeleton" aria-hidden="true"><i></i><span><i></i><i></i><i></i></span></div>';
function loading(){q('items').setAttribute('aria-busy','true');q('preview').setAttribute('aria-busy','true');if(!state||JSON.stringify(query)!==appliedQuery){clearPreviewMeta();setMarkup(q('items'),Array.from({length:6},skeleton).join(''));setMarkup(q('preview'),'<div class="recent-preview-skeleton" aria-hidden="true"><i></i><i></i><i></i><i></i></div>');}}
function filters(){keyedMarkup(q('filters'),kinds.map(([kind,label])=>{const count=state?.counts?.[kind as keyof TrayState['counts']]??(kind===query.kind?state?.total:undefined);return {key:kind,html:`<button type="button" data-kind="${kind}" aria-pressed="${query.kind===kind}" class="${query.kind===kind?'active':''}"><span>${label}</span>${count===undefined?'':`<small>${formatNumber(count)}</small>`}</button>`};}));}
function categories(){const choices=[{id:'',name:tr('全部分类')},{id:'favorites',name:tr('收藏')},...(state?.categories||[])];keyedMarkup(q('categories'),choices.map(({id,name})=>({key:id||':all',html:`<button type="button" data-category="${esc(id)}" aria-pressed="${query.category===id}" class="${query.category===id?'active':''}">${esc(name)}</button>`})));}
function renderPreview(value:TrayPreview,identity:string){const retain=previewKey===identity;patchMarkup(q('preview'),tr`<div class="preview-content preview-kind-${value.kind}">${value.image?tr`<img class="preview-image" src="${esc(value.image)}" alt="图片预览">`:''}${value.text?`<pre class="${value.kind==='code'?'code':''}">${esc(value.text)}</pre>`:''}${value.files.length?`<ul class="files">${value.files.map(file=>`<li>${icon(file.directory?Folder:FileText)}<span><strong>${esc(file.name)}</strong><small>${file.saved?(file.directory?tr('已保存文件夹'):tr('已保存附件')):tr('本机文件引用')}</small></span></li>`).join('')}</ul>`:''}${!value.text&&!value.image&&!value.files.length?tr('<div class="empty">此格式无可用预览，仍可复制原内容</div>'):''}${value.truncated?tr('<p class="preview-note">仅预览前 32,768 字，复制使用完整内容。</p>'):''}</div><div class="preview-meta"><span>${esc(formatDate(value.updatedAt,{dateStyle:'medium',timeStyle:'medium'}))}</span><span>${formatNumber(value.bytes)} ${tr('字节')}</span></div>`,undefined,retain?node=>node.classList.contains('preview-content'):undefined);const meta=q('preview').querySelector('.preview-meta');if(meta){previewMeta.replaceChildren(meta);previewMeta.hidden=false;}previewValue=value;previewKey=identity;}
function select(token:string,delay=0){
 if(!active||busy||searching)return;const item=state?.items.find(i=>i.token===token);if(!item)return;
 const identity=JSON.stringify([item.id,item.previewKey||item.token,item.kind]),retain=previewValue&&previewKey===identity;
 const old=q('items').querySelector('.tray-row.selected'),row=q('items').querySelector('[data-token="'+CSS.escape(token)+'"]');
 if(old&&old!==row){old.classList.remove('selected');old.setAttribute('aria-selected','false');}if(row&&old!==row){row.classList.add('selected');row.setAttribute('aria-selected','true');}
 selected=token;buttons();clearTimeout(hover);
 if(retain&&previewValue){renderPreview({...previewValue,token,title:item.title,source:item.source,updatedAt:item.updatedAt,bytes:item.bytes??previewValue.bytes},identity);return;}
 previewValue=undefined;previewKey='';clearPreviewMeta();q('preview').setAttribute('aria-busy','true');setMarkup(q('preview'),'<div class="recent-preview-skeleton" aria-hidden="true"><i></i><i></i><i></i><i></i></div>');
 const request=++previewSerial;hover=setTimeout(()=>{void(async()=>{try{const value=await api.preview(token);if(active&&request===previewSerial&&selected===token){q('preview').removeAttribute('aria-busy');renderPreview(value,identity);}}catch(e){if(active&&request===previewSerial&&selected===token){q('preview').removeAttribute('aria-busy');setMarkup(q('preview'),`<div class="empty">${esc(tr('预览加载失败，请重新选择记录'))}</div>`);notice(e);}}})().catch(notice);},delay);
}
async function refresh(){
 if(!active||busy)return;const request=++querySerial,previous=state?.items.find(i=>i.token===selected)?.id,criteria=JSON.stringify(query),requested={...query},position=criteria===appliedQuery?retainListScroll(q('items'),'.tray-row'):()=>{q('items').scrollTop=0;};
 searching=true;previewSerial++;clearTimeout(hover);if(criteria!==appliedQuery){clearPreview();q('items').inert=true;}loading();buttons();
 let next:TrayState;try{next=await api.state(requested);}catch(e){if(request!==querySerial||!active)return;if(query.category&&String(e).includes(TRAY_CATEGORY_MISSING)){query.category='';return refresh();}state=undefined;searching=false;clearPreview();q('items').inert=false;q('items').removeAttribute('aria-busy');q('preview').removeAttribute('aria-busy');setMarkup(q('items'),`<div class="empty"><strong>${esc(tr('暂时无法读取记录'))}</strong><button id="retry">${esc(tr('重试'))}</button></div>`);q('retry').onclick=()=>run(refresh);throw e;}
 if(request!==querySerial||!active)return;state=next;searching=false;appliedQuery=criteria;q('items').inert=false;q('items').removeAttribute('aria-busy');q('preview').removeAttribute('aria-busy');document.documentElement.dataset.theme=state.dark?'dark':'light';
 const initial=state.items.find(i=>i.id===previous)||state.items[0];selected=initial?.token||'';
 filters();categories();
 keyedMarkup(q('items'),state.items.length?state.items.map(i=>({key:i.id,html:`<button type="button" role="option" aria-selected="false" class="tray-row" data-token="${i.token}" data-id="${i.id}" draggable="${i.draggable}"><span class="type-icon ${i.kind}">${icon(symbols[i.kind])}</span><span class="row-body"><strong title="${esc(i.title)}">${esc(i.title)}</strong></span><span class="row-end"><span class="row-source" title="${esc(i.source)}" aria-label="${esc(i.source)}">${appIdentity(i.source)}</span>${i.favorite||i.pinned?`<span class="flags">${i.favorite?`<span class="flag-favorite" role="img" aria-label="${esc(tr('收藏'))}">${icon(Star)}</span>`:''}${i.pinned?`<span class="flag-pinned" role="img" aria-label="${esc(tr('置顶'))}">${icon(Pin)}</span>`:''}</span>`:''}<time>${esc(recentTime.format(i.updatedAt))}</time></span></button>`})):[{key:':empty',html:tr('<div class="empty"><strong>没有匹配记录</strong><span>尝试其他关键词或分类</span></div>')}]);
 void hydrateAppIcons(q('items'),api.appIcons);
 position();if(initial)select(initial.token);else clearPreview();q('paste-selected').title=state.canPaste?tr('粘贴到原窗口'):tr('未找到粘贴目标 · 可先复制，再手动粘贴');
}
function scheduleRefresh(){if(!active||refreshTimer)return;refreshTimer=setTimeout(()=>{refreshTimer=undefined;run(refresh);},32);}
function bindRows(){
 const box=q('items'),rowFor=(event:Event)=>event.target instanceof Element?event.target.closest('.tray-row'):null;
 box.addEventListener('mouseover',event=>{const row=rowFor(event);if(row instanceof HTMLButtonElement&&!(event.relatedTarget instanceof Node&&row.contains(event.relatedTarget)))select(row.dataset.token!,180);});
 box.addEventListener('focusin',event=>{const row=rowFor(event);if(row instanceof HTMLButtonElement)select(row.dataset.token!);});
 box.addEventListener('click',event=>{const row=rowFor(event);if(row instanceof HTMLButtonElement&&Date.now()>=dragUntil)run(()=>use(row.dataset.token!,false));});
 box.addEventListener('contextmenu',event=>{const row=rowFor(event);if(row instanceof HTMLButtonElement){event.preventDefault();run(()=>use(row.dataset.token!,true));}});
 box.addEventListener('dragstart',event=>{event.preventDefault();const row=rowFor(event);if(!(row instanceof HTMLButtonElement)||busy||searching||!row.draggable)return;dragUntil=Date.now()+1500;busy=true;buttons();api.drag(row.dataset.token!);});
 q('filters').addEventListener('click',event=>{const button=event.target instanceof Element?event.target.closest('button'):null;if(button instanceof HTMLButtonElement){query.kind=button.dataset.kind as TrayQuery['kind'];run(refresh);}});
}
bindRows();
async function use(token:string,paste:boolean){if(busy||searching||!token)return;if(paste&&!state?.canPaste)throw new Error(tr('请先切换到目标应用，或使用复制'));busy=true;buttons();const finish=actionFeedback(q<HTMLButtonElement>(paste?'paste-selected':'copy-selected'));try{await api.use(token,paste);}catch(e){busy=false;buttons();throw e;}finally{finish();}}
q('open-main').innerHTML=icon(ArrowUpRight);q('close').innerHTML=icon(X);q('open-main').onclick=()=>run(()=>api.main());q('close').onclick=()=>run(()=>api.hide());q('copy-selected').onclick=()=>run(()=>use(selected,false));q('paste-selected').onclick=()=>run(()=>use(selected,true));
q<HTMLInputElement>('search').oninput=()=>{query.text=q<HTMLInputElement>('search').value;querySerial++;searching=true;clearPreview();q('items').inert=true;loading();clearTimeout(debounce);debounce=setTimeout(()=>run(refresh),180);};
q('categories').addEventListener('click',event=>{const button=event.target instanceof Element?event.target.closest('button[data-category]'):null;if(button instanceof HTMLButtonElement){query.category=button.dataset.category||'';run(refresh);}});
document.addEventListener('keydown',e=>{if(e.defaultPrevented||e.isComposing||document.querySelector('dialog[open]'))return;if(e.isComposing)return;if(e.key==='Escape'){e.preventDefault();run(()=>api.hide());return;}if(e.ctrlKey&&e.key.toLowerCase()==='f'){e.preventDefault();q<HTMLInputElement>('search').focus();q<HTMLInputElement>('search').select();return;}if(document.activeElement?.closest('#notice'))return;if(busy||searching)return;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const rows=Array.from(q('items').querySelectorAll<HTMLButtonElement>('[data-token]')),index=rows.findIndex(r=>r.dataset.token===selected),next=Math.max(0,Math.min(rows.length-1,index+(e.key==='ArrowDown'?1:-1)));rows[next]?.focus();rows[next]?.scrollIntoView({block:'nearest'});}else if(e.key==='Enter'&&selected&&!document.activeElement?.closest('.header-actions,.preview-actions,#filters,#categories')){e.preventDefault();run(()=>use(selected,e.ctrlKey));}});
filters();categories();loading();
api.onSession?.(open=>{active=open;querySerial++;previewSerial++;clearTimeout(hover);clearTimeout(debounce);clearTimeout(refreshTimer);refreshTimer=undefined;state=undefined;busy=false;searching=true;appliedQuery='';q('notice').replaceChildren();query={...trayQuery};q<HTMLInputElement>('search').value='';q('items').scrollTop=0;clearPreview();filters();categories();if(open){loading();if(document.hasFocus())q<HTMLInputElement>('search').focus({preventScroll:true});run(refresh);}else{setMarkup(q('items'),'');setMarkup(q('preview'),'');}});
api.onChange(scheduleRefresh);api.onNotice(message=>{busy=false;buttons();notice(message);});

document.addEventListener('clipper:feedback',e=>notice((e as CustomEvent).detail));

q('notice').classList.add('feedback-toast');document.body.append(q('notice'));
