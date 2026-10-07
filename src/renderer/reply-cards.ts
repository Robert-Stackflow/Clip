import type {SnippetSummary} from '../shared/preview';
import {t as tr} from '../shared/i18n';
import {shortcutLabel} from '../shared/shortcut';
import {keyedMarkup} from './markup';
import {bindSortable} from './sortable';
import {ActionScope} from './actions';
import {bindHeadingMenu} from './heading-menu';

interface Context {
 icon(name:string):string;label(kind:string):string;highlight(text:string):string;empty():string;
 select(id:string):void;use(id:string,paste:boolean):Promise<unknown>;edit(id:string):Promise<unknown>;
 remove(id:string):unknown;reorder(ids:string[]):Promise<unknown>;notice(error:unknown):void;
 selection?:{checked:ReadonlySet<string>;toggle(id:string):void};
}
const esc=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const actions=new ActionScope();
const boundCards=new WeakSet<HTMLElement>();
export function renderReplyCards(root:HTMLElement,list:SnippetSummary[],context:Context,layout:'cards'|'list'='cards'){
 const {icon,highlight}=context;
 root.dataset.replyLayout=layout;
 root.classList.toggle('reply-selection-mode',!!context.selection);
 root.closest('.workspace')!.classList.toggle('is-empty',!list.length);
 root.closest('.collection')!.classList.add('replies-collection');
 keyedMarkup(root,list.length?list.map(item=>({key:'reply:'+item.id,html:`<article class="reply-card" data-id="${item.id}" data-checked="${!!context.selection?.checked.has(item.id)}"><header>${context.selection?'<input type="checkbox" data-reply-check="'+item.id+'" aria-label="'+esc(tr('选择')+' '+item.title)+'" '+(context.selection.checked.has(item.id)?'checked':'')+'>':''}<span class="reply-card-kind" title="${esc(context.label(item.kind))}">${icon(item.kind)}</span><strong>${highlight(item.title)}</strong><span class="row-sort-grip" draggable="true" tabindex="0" aria-label="${esc(tr('拖拽排序')+' · '+item.title)}" title="${tr('拖拽排序')}">${icon('grip')}</span></header><div class="reply-card-preview">${item.kind==='image'&&item.thumbnail&&/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(item.thumbnail)?'<img src="'+esc(item.thumbnail)+'" alt="" loading="lazy">':highlight(item.text.slice(0,240)||context.label(item.kind))}</div><footer><button type="button" data-reply-use="paste">${icon('enter')}<span>${tr('粘贴')}</span></button><button type="button" data-reply-use="copy" aria-label="${esc(tr('复制')+' · '+item.title)}">${icon('copy')}<span>${tr('复制')}</span></button><span class="spacer"></span>${item.shortcut?'<kbd>'+esc(shortcutLabel(item.shortcut))+'</kbd>':''}<button type="button" data-reply-more title="${tr('更多操作')}" aria-label="${esc(tr('更多操作')+' · '+item.title)}">${icon('more')}</button></footer><div id="reply-menu-${item.id}" class="reply-card-menu collection-more-menu" data-reply-menu role="menu" aria-label="${tr('更多操作')}" aria-hidden="true" hidden><button type="button" data-reply-edit role="menuitem">${icon('edit')}<span>${tr('编辑回复')}</span></button><button type="button" data-reply-delete role="menuitem">${icon('trash')}<span>${tr('删除回复')}</span></button></div></article>`})):[{key:':empty',html:context.empty()}]);
 for(const card of root.querySelectorAll<HTMLElement>('.reply-card')){
  const id=card.dataset.id!;card.onclick=event=>{if(context.selection&&event.target instanceof Element&&!event.target.closest('input,button'))context.selection.toggle(id);};const check=card.querySelector<HTMLInputElement>('[data-reply-check]');if(check)check.onchange=()=>context.selection?.toggle(id);if(!boundCards.has(card)){boundCards.add(card);card.addEventListener('focusin',()=>context.select(id));bindHeadingMenu(card,{anchor:'[data-reply-more]',panel:'[data-reply-menu]'});}
  for(const button of card.querySelectorAll<HTMLButtonElement>('[data-reply-use]'))actions.bind(button,()=>context.use(id,button.dataset.replyUse==='paste'),context.notice,'clipboard');
  actions.bind(card.querySelector<HTMLButtonElement>('[data-reply-edit]'),()=>context.edit(id),context.notice,'reply-edit:'+id);
  actions.bind(card.querySelector<HTMLButtonElement>('[data-reply-delete]'),()=>context.remove(id),context.notice,'reply-delete:'+id);
 }
 bindSortable(root,{itemSelector:'.reply-card',handleSelector:'.row-sort-grip',id:item=>item.dataset.id!,enabled:()=>!context.selection,commit:async ids=>{await context.reorder(ids);}});
}
