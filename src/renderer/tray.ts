import {setMarkup,keyedMarkup,patchMarkup,retainListScroll} from './markup';
import {transientNotice} from './feedback';
import {actionFeedback} from './actions';
import './locale';
import {t as tr,formatDate,formatNumber} from '../shared/i18n';
import './appearance';
import './tray.css';
import {createElement,ArrowUpRight,X,FileText,Image,Folder,Link,Code,Star,Pin,type IconNode} from 'lucide';
import {TRAY_CATEGORY_MISSING,trayQuery,type TrayAPI,type TrayQuery,type TrayState,type TrayPreview} from '../shared/tray';
declare global{interface Window{clipperTray:TrayAPI}}
const api=window.clipperTray,q=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const icon=(node:IconNode)=>createElement(node,{'aria-hidden':'true','stroke-width':1.75}).outerHTML;
const symbols={text:FileText,image:Image,files:Folder,link:Link,code:Code},kinds=[['all',tr('全部')],['text',tr('文字')],['image',tr('图片')],['files',tr('文件')],['link',tr('链接')],['code',tr('代码')]];
let query:TrayQuery={...trayQuery},state:TrayState|undefined,selected='',querySerial=0,previewSerial=0,busy=false,searching=true,dragUntil=0;
let previewValue:TrayPreview|undefined,previewKey='',appliedQuery='',refreshTimer:ReturnType<typeof setTimeout>|undefined;
let hover:ReturnType<typeof setTimeout>|undefined,debounce:ReturnType<typeof setTimeout>|undefined;
const notice=transientNotice(q('notice'));
const run=(action:()=>Promise<unknown>)=>void action().catch(notice);
function buttons(){q<HTMLButtonElement>('copy-selected').disabled=!selected||busy||searching;q<HTMLButtonElement>('paste-selected').disabled=!selected||busy||searching||!state?.canPaste;}
function clearPreview(){previewSerial++;clearTimeout(hover);selected='';previewValue=undefined;previewKey='';setMarkup(q('preview'),tr('<div class="empty">悬停或使用方向键预览</div>'));buttons();}
function renderPreview(value:TrayPreview,identity:string){const retain=previewKey===identity;patchMarkup(q('preview'),tr`<div class="preview-heading ${value.kind}">${icon(symbols[value.kind])}<strong>${esc(value.title)}</strong></div><div class="preview-content">${value.image?tr`<img class="preview-image" src="${esc(value.image)}" alt="图片预览">`:''}${value.text?`<pre class="${value.kind==='code'?'code':''}">${esc(value.text)}</pre>`:''}${value.files.length?`<ul class="files">${value.files.map(file=>`<li>${icon(file.directory?Folder:FileText)}<span><strong>${esc(file.name)}</strong><small>${file.saved?(file.directory?tr('已保存文件夹'):tr('已保存附件')):tr('本机文件引用')}</small></span></li>`).join('')}</ul>`:''}${!value.text&&!value.image&&!value.files.length?tr('<div class="empty">此格式无可用预览，仍可复制原内容</div>'):''}${value.truncated?tr('<p class="preview-note">仅预览前 32,768 字，复制使用完整内容。</p>'):''}</div><dl><dt>来源</dt><dd>${esc(value.source)}</dd><dt>时间</dt><dd>${esc(formatDate(value.updatedAt,{dateStyle:'medium',timeStyle:'medium'}))}</dd><dt>大小</dt><dd>${formatNumber(value.bytes)} 字节</dd></dl>`,undefined,retain?node=>node.classList.contains('preview-content'):undefined);previewValue=value;previewKey=identity;}
function select(token:string,delay=0){
 if(busy||searching)return;const item=state?.items.find(i=>i.token===token);if(!item)return;
 const identity=JSON.stringify([item.id,item.previewKey||item.token,item.kind]),retain=previewValue&&previewKey===identity;
 const old=q('items').querySelector('.tray-row.selected'),row=q('items').querySelector('[data-token="'+CSS.escape(token)+'"]');
 if(old&&old!==row){old.classList.remove('selected');old.setAttribute('aria-selected','false');}if(row&&old!==row){row.classList.add('selected');row.setAttribute('aria-selected','true');}
 selected=token;buttons();clearTimeout(hover);
 if(retain&&previewValue){renderPreview({...previewValue,token,title:item.title,source:item.source,updatedAt:item.updatedAt,bytes:item.bytes??previewValue.bytes},identity);return;}
 previewValue=undefined;previewKey='';setMarkup(q('preview'),tr('<div class="empty">正在读取预览…</div>'));
 const request=++previewSerial;hover=setTimeout(()=>{void(async()=>{try{const value=await api.preview(token);if(request===previewSerial&&selected===token)renderPreview(value,identity);}catch(e){if(request===previewSerial&&selected===token)notice(e);}})();},delay);
}
async function refresh(){
 if(busy)return;const request=++querySerial,previous=state?.items.find(i=>i.token===selected)?.id,criteria=JSON.stringify(query),requested={...query},position=retainListScroll(q('items'),'.tray-row');
 searching=true;previewSerial++;clearTimeout(hover);if(criteria!==appliedQuery){clearPreview();q('items').inert=true;}buttons();
 let next:TrayState;try{next=await api.state(requested);}catch(e){if(request!==querySerial)return;if(query.category&&String(e).includes(TRAY_CATEGORY_MISSING)){query.category='';return refresh();}state=undefined;searching=false;clearPreview();q('items').inert=true;throw e;}
 if(request!==querySerial)return;state=next;searching=false;appliedQuery=criteria;q('items').inert=false;document.documentElement.dataset.theme=state.dark?'dark':'light';
 const initial=state.items.find(i=>i.id===previous)||state.items[0];selected=initial?.token||'';
  setMarkup(q('category'),tr('<option value="">全部分类</option><option value="favorites">收藏</option>')+state.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join(''));q<HTMLSelectElement>('category').value=query.category;
 keyedMarkup(q('filters'),kinds.map(([kind,label])=>({key:kind,html:`<button type="button" data-kind="${kind}" aria-pressed="${query.kind===kind}" class="${query.kind===kind?'active':''}">${label}</button>`})));
 q('count').textContent=state.total>state.items.length?tr`显示最近 ${formatNumber(state.items.length)} / ${formatNumber(state.total)} 项 · 搜索可缩小范围`:tr`${formatNumber(state.total)} 项记录`;
 keyedMarkup(q('items'),state.items.length?state.items.map(i=>({key:i.id,html:`<button type="button" role="option" aria-selected="false" class="tray-row" data-token="${i.token}" data-id="${i.id}" draggable="${i.draggable}"><span class="type-icon ${i.kind}">${icon(symbols[i.kind])}</span><span class="row-body"><strong>${esc(i.title)}</strong><span>${esc(i.preview||i.source)}</span><small class="row-meta"><span>${esc(i.source)}</span><time>${esc(formatDate(i.updatedAt,{hour:'2-digit',minute:'2-digit'}))}</time></small></span><span class="flags">${i.favorite?icon(Star):''}${i.pinned?icon(Pin):''}</span></button>`})):[{key:':empty',html:tr('<div class="empty"><strong>没有匹配记录</strong><span>尝试其他关键词或分类</span></div>')}]);
 position();if(initial)select(initial.token);else clearPreview();q('paste-selected').title=state.canPaste?tr('粘贴到原窗口'):tr('未找到粘贴目标 · 可先复制，再手动粘贴');
}
function scheduleRefresh(){if(refreshTimer)return;refreshTimer=setTimeout(()=>{refreshTimer=undefined;run(refresh);},32);}
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
q<HTMLInputElement>('search').oninput=()=>{query.text=q<HTMLInputElement>('search').value;querySerial++;searching=true;clearPreview();q('items').inert=true;clearTimeout(debounce);debounce=setTimeout(()=>run(refresh),180);};
q<HTMLSelectElement>('category').onchange=()=>{query.category=q<HTMLSelectElement>('category').value;run(refresh);};
document.addEventListener('keydown',e=>{if(e.defaultPrevented||e.isComposing||document.querySelector('dialog[open]'))return;if(e.isComposing)return;if(e.key==='Escape'){e.preventDefault();run(()=>api.hide());return;}if(e.ctrlKey&&e.key.toLowerCase()==='f'){e.preventDefault();q<HTMLInputElement>('search').focus();q<HTMLInputElement>('search').select();return;}if(document.activeElement?.closest('#notice'))return;if(busy||searching)return;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const rows=Array.from(q('items').querySelectorAll<HTMLButtonElement>('[data-token]')),index=rows.findIndex(r=>r.dataset.token===selected),next=Math.max(0,Math.min(rows.length-1,index+(e.key==='ArrowDown'?1:-1)));rows[next]?.focus();rows[next]?.scrollIntoView({block:'nearest'});}else if(e.key==='Enter'&&selected&&!(document.activeElement instanceof HTMLSelectElement)&&!document.activeElement?.closest('.header-actions,.preview-actions,#filters')){e.preventDefault();run(()=>use(selected,e.ctrlKey));}});
api.onChange(scheduleRefresh);api.onNotice(message=>{busy=false;buttons();notice(message);});

document.addEventListener('clipper:feedback',e=>notice((e as CustomEvent).detail));

q('notice').classList.add('feedback-toast');document.body.append(q('notice'));
