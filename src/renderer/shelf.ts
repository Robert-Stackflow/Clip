import './shelf.css';
import {createElement,Pin,Plus,ArrowUpRight,Copy,X,FileText,Image,Folder,type IconNode} from 'lucide';
import type {ShelfAPI,ShelfState} from '../shared/desktop';
declare global {interface Window{clipperShelf:ShelfAPI}}
const api=window.clipperShelf;
const q=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const icon=(node:IconNode)=>createElement(node,{'aria-hidden':'true','stroke-width':1.7}).outerHTML;
let state:ShelfState,token=0,noticeTimer:ReturnType<typeof setTimeout>,dragDepth=0;
function notice(e:unknown){q('notice').textContent=String(e instanceof Error?e.message:e).replace(/^Error invoking remote method '[^']+': Error: /,'');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>q('notice').textContent='',7000);}
const run=(fn:()=>Promise<unknown>)=>void fn().catch(notice);
async function refresh(){const request=++token,next=await api.state();if(request!==token)return;state=next;document.documentElement.dataset.theme=state.dark?'dark':'light';q('top').classList.toggle('active',state.onTop);q('top').setAttribute('aria-pressed',String(state.onTop));q('count').textContent=`${state.items.length} 项`;const box=q('items'),position=box.scrollTop,focused=(document.activeElement as HTMLElement)?.dataset.focus;
 box.innerHTML=state.items.length?state.items.map(item=>`<article class="shelf-row" data-id="${item.id}" draggable="${item.kind==='image'||item.kind==='files'}"><div class="visual">${item.thumbnail?`<img src="${esc(item.thumbnail)}" alt="图片预览">`:icon(item.kind==='files'?Folder:item.kind==='image'?Image:FileText)}</div><div class="row-body"><strong title="${esc(item.title)}">${esc(item.title)}</strong><p>${esc(item.preview||item.source)}</p></div><div class="actions"><button data-copy="${item.id}" data-focus="copy-${item.id}" title="复制" aria-label="复制 ${esc(item.title)}">${icon(Copy)}</button><button data-remove="${item.id}" data-focus="remove-${item.id}" title="移出容器，保留历史与源文件" aria-label="移出 ${esc(item.title)}">${icon(X)}</button></div></article>`).join(''):`<div class="empty">${icon(Folder)}<strong>临时放在这里</strong><p>把文字、图片或文件拖入窗口<br>稍后复制，或将图片和文件拖到其他应用</p><button id="empty-choose">选择文件</button></div>`;
 box.scrollTop=position;if(focused)box.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});box.querySelectorAll<HTMLElement>('[data-copy]').forEach(b=>b.onclick=()=>run(async()=>{await api.copy(b.dataset.copy!,false);notice('已复制');}));box.querySelectorAll<HTMLElement>('[data-remove]').forEach(b=>b.onclick=()=>run(()=>api.remove(b.dataset.remove!)));box.querySelectorAll<HTMLElement>('.shelf-row').forEach(row=>{row.ondblclick=e=>{if(!(e.target as HTMLElement).closest('button'))run(()=>api.copy(row.dataset.id!,true));};row.ondragstart=e=>{e.preventDefault();if(row.draggable)api.drag(row.dataset.id!);};});q('empty-choose')?.addEventListener('click',()=>run(()=>api.choose()));
}
q('top').innerHTML=icon(Pin);q('choose').innerHTML=icon(Plus);q('main').innerHTML=icon(ArrowUpRight);q('top').onclick=()=>run(()=>api.top(!state.onTop));q('choose').onclick=()=>run(()=>api.choose());q('main').onclick=()=>run(()=>api.main());
const supported=(event:DragEvent)=>event.dataTransfer?.types.some(t=>t==='Files'||t==='text/plain');
document.addEventListener('dragenter',e=>{if(supported(e)){e.preventDefault();dragDepth++;q('drop-hint').hidden=false;}});
document.addEventListener('dragover',e=>{if(supported(e)){e.preventDefault();e.dataTransfer!.dropEffect='copy';}});
document.addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)q('drop-hint').hidden=true;});
document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;q('drop-hint').hidden=true;const files=Array.from(e.dataTransfer?.files||[]),text=e.dataTransfer?.getData('text/plain')||'';if(files.length)run(async()=>{await api.dropFiles(files);notice('已加入容器');});else if(text.trim())run(async()=>{await api.dropText(text);notice('已加入容器');});});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();run(()=>api.hide());}});window.addEventListener('blur',()=>{dragDepth=0;q('drop-hint').hidden=true;});
api.onChange(()=>run(refresh));api.onNotice(notice);run(refresh);
