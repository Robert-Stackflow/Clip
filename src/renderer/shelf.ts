import {keyedMarkup,clearMarkup,retainListScroll} from './markup';
import {isWindowVisible,onWindowVisibility,setupWindowVisibility} from './window-visibility';
import {t as tr} from '../shared/i18n';
import {transientNotice} from './feedback';
import {ActionScope} from './actions';
import './locale';
import './appearance';
import './shelf.css';
import {createElement,Pin,Plus,ArrowUpRight,Copy,X,FileText,Image,Folder,Minimize2,Maximize2,type IconNode} from 'lucide';
import type {ShelfAPI,ShelfState} from '../shared/desktop';
declare global {interface Window{clipperShelf:ShelfAPI}}
const api=window.clipperShelf;
const q=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const icon=(node:IconNode)=>createElement(node,{'aria-hidden':'true','stroke-width':1.75}).outerHTML;
let state:ShelfState|undefined,token=0,dragDepth=0,refreshTimer:ReturnType<typeof setTimeout>|undefined,savedPosition:{top:number;left:number;anchor?:{id:string;offset:number}}|undefined,transitionMode:ShelfState['mode']|undefined;
const notice=transientNotice(q('notice'));
const run=(fn:()=>Promise<unknown>)=>void fn().catch(notice),actions=new ActionScope();
function suspend(){token++;clearTimeout(refreshTimer);refreshTimer=undefined;const box=q('items'),rect=box.getBoundingClientRect(),row=document.elementFromPoint(rect.left+24,rect.top+12)?.closest<HTMLElement>('.shelf-row');savedPosition={top:box.scrollTop,left:box.scrollLeft,...(row&&box.contains(row)?{anchor:{id:row.dataset.id!,offset:row.getBoundingClientRect().top-rect.top}}:{})};state=undefined;clearMarkup(box);box.replaceChildren();dragDepth=0;q('drop-hint').hidden=true;document.body.classList.remove('is-dragging');}
function scheduleRefresh(){if(!isWindowVisible()||refreshTimer)return;refreshTimer=setTimeout(()=>{refreshTimer=undefined;run(refresh);},32);}
async function refresh(){
 if(!isWindowVisible())return;const request=++token;let next:ShelfState;try{next=await api.state();}catch(e){if(request===token&&isWindowVisible())throw e;return;}if(request!==token||!isWindowVisible())return;state=next;
 const visibleMode=transitionMode??state.mode;document.documentElement.dataset.theme=state.dark?'dark':'light';document.documentElement.dataset.mode=visibleMode;q('top').classList.toggle('active',state.onTop);q('top').setAttribute('aria-pressed',String(state.onTop));q('mode').innerHTML=icon(visibleMode==='compact'?Maximize2:Minimize2);q('mode').setAttribute('aria-label',visibleMode==='compact'?tr('展开拖放窗口'):tr('收起为小窗'));q('mode').setAttribute('title',visibleMode==='compact'?tr('展开拖放窗口'):tr('收起为小窗'));
 q('count').textContent=tr`${state.items.length} 项`;q('compact-count').textContent=state.items.length?tr`${state.items.length} 项已暂存 · 点击展开`:tr('松开鼠标即可暂存');const box=q('items'),position=retainListScroll(box,'.shelf-row');
  keyedMarkup(box,state.items.length?state.items.map(item=>({key:item.id,html:tr`<article class="shelf-row" data-id="${item.id}" draggable="${item.kind==='image'||item.kind==='files'}"><div class="visual">${item.thumbnail?tr`<img src="${esc(item.thumbnail)}" alt="图片预览">`:icon(item.kind==='files'?Folder:item.kind==='image'?Image:FileText)}</div><div class="row-body"><strong title="${esc(item.title)}">${esc(item.title)}</strong><p>${esc(item.preview||item.source)}</p></div><div class="actions"><button data-copy="${item.id}" data-focus="copy-${item.id}" title="复制" aria-label="复制 ${esc(item.title)}">${icon(Copy)}</button><button data-remove="${item.id}" data-focus="remove-${item.id}" title="移出容器，保留历史与源文件" aria-label="移出 ${esc(item.title)}">${icon(X)}</button></div></article>`})):[{key:':empty',html:`<div class="empty">${icon(Folder)}<strong>${tr('容器为空')}</strong><p>${tr('拖入文字或文件 · 图片和文件可拖出')}</p><button id="empty-choose">${tr('选择文件')}</button></div>`}]);
 if(savedPosition){box.scrollTop=savedPosition.top;box.scrollLeft=savedPosition.left;const anchor=savedPosition.anchor,row=anchor&&box.querySelector<HTMLElement>('[data-id="'+CSS.escape(anchor.id)+'"]');if(row&&anchor)box.scrollTop+=row.getBoundingClientRect().top-box.getBoundingClientRect().top-anchor.offset;savedPosition=undefined;}else position();
 box.querySelectorAll('[data-copy]').forEach(b=>{if(b instanceof HTMLButtonElement)actions.bind(b,async()=>{await api.copy(b.dataset.copy!,false);notice(tr('已复制'));},notice,'clipboard');});
 box.querySelectorAll('[data-remove]').forEach(b=>{if(b instanceof HTMLButtonElement)actions.bind(b,()=>api.remove(b.dataset.remove!),notice,'remove:'+b.dataset.remove!);});
 actions.bind(q<HTMLButtonElement>('empty-choose'),()=>api.choose(),notice,'choose');
}
function bindRows(){
 const box=q('items');
 box.addEventListener('dblclick',event=>{if(!(event.target instanceof Element)||event.target.closest('button')||!isWindowVisible())return;const row=event.target.closest('.shelf-row');if(!(row instanceof HTMLElement)||!state?.items.some(i=>i.id===row.dataset.id!))return;run(()=>actions.run('clipboard',()=>api.copy(row.dataset.id!,true),Array.from(row.querySelectorAll<HTMLButtonElement>('[data-copy]'))));});
 box.addEventListener('dragstart',event=>{event.preventDefault();const row=event.target instanceof Element?event.target.closest('.shelf-row'):null;if(!(row instanceof HTMLElement)||!isWindowVisible()||!state?.items.some(i=>i.id===row.dataset.id&&(i.kind==='image'||i.kind==='files')))return;api.drag(row.dataset.id!);});
}
bindRows();
document.addEventListener('clipper:feedback',e=>notice((e as CustomEvent).detail));
let transitionRevision=0;
const changeMode=async(mode:'compact'|'expanded')=>{const previous=document.documentElement.dataset.mode;transitionMode=mode;transitionRevision++;document.documentElement.dataset.transitioning='';document.documentElement.dataset.mode=mode;try{await api.mode(mode,matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(error){transitionMode=undefined;if(previous)document.documentElement.dataset.mode=previous;else delete document.documentElement.dataset.mode;delete document.documentElement.dataset.transitioning;throw error;}};
q('top').innerHTML=icon(Pin);q('choose').innerHTML=icon(Plus);q('main').innerHTML=icon(ArrowUpRight);q('compact-icon').innerHTML=icon(Folder);q('transition-icon').innerHTML=icon(Folder);actions.bind(q<HTMLButtonElement>('top'),()=>state&&isWindowVisible()?api.top(!state.onTop):undefined,notice);actions.bind(q<HTMLButtonElement>('choose'),()=>api.choose(),notice);actions.bind(q<HTMLButtonElement>('main'),()=>api.main(),notice);actions.bind(q<HTMLButtonElement>('mode'),()=>changeMode(state?.mode==='compact'?'expanded':'compact'),notice,'shelf-mode');actions.bind(q<HTMLButtonElement>('compact-open'),()=>changeMode('expanded'),notice,'shelf-mode');
const supported=(event:DragEvent)=>event.dataTransfer?.types.some(t=>t==='Files'||t==='text/plain');
document.addEventListener('dragenter',e=>{if(supported(e)){e.preventDefault();dragDepth++;q('drop-hint').hidden=false;document.body.classList.add('is-dragging');q('compact-count').textContent=tr('松开以加入容器');}});
document.addEventListener('dragover',e=>{if(supported(e)){e.preventDefault();e.dataTransfer!.dropEffect='copy';}});
document.addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth){q('drop-hint').hidden=true;document.body.classList.remove('is-dragging');q('compact-count').textContent=state?.items.length?tr`${state.items.length} 项已暂存 · 点击展开`:tr('松开鼠标即可暂存');}});
document.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();dragDepth=0;q('drop-hint').hidden=true;document.body.classList.remove('is-dragging');const files=Array.from(e.dataTransfer?.files||[]),text=e.dataTransfer?.getData('text/plain')||'';if(files.length)run(async()=>{await api.dropFiles(files);await refresh();});else if(text.trim())run(async()=>{await api.dropText(text);await refresh();});});
document.addEventListener('keydown',e=>{if(e.defaultPrevented||e.isComposing||document.querySelector('dialog[open]'))return;if(e.key==='Escape'){e.preventDefault();run(()=>api.hide());}});window.addEventListener('blur',()=>{dragDepth=0;q('drop-hint').hidden=true;document.body.classList.remove('is-dragging');});
api.onChange(scheduleRefresh);api.onTransition((active,mode,size)=>{const revision=++transitionRevision;transitionMode=mode;document.documentElement.dataset.transitioning='';document.documentElement.dataset.mode=mode;if(active){run(refresh);return;}const settle=async()=>{try{const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));const deadline=performance.now()+500;while(size&&isWindowVisible()&&performance.now()<deadline&&(Math.abs(innerWidth-size.width)>4||Math.abs(innerHeight-size.height)>4))await frame();await refresh();await frame();await frame();}finally{if(revision===transitionRevision){document.documentElement.dataset.mode=mode;transitionMode=undefined;delete document.documentElement.dataset.transitioning;scheduleRefresh();}}};void settle().catch(notice);});api.onNotice(notice);onWindowVisibility(visible=>{if(visible)run(refresh);else{transitionRevision++;transitionMode=undefined;delete document.documentElement.dataset.transitioning;suspend();}});setupWindowVisibility();run(refresh);

q('notice').classList.add('feedback-toast');document.body.append(q('notice'));
