import {categoryIcons,categoryIconValid,type CategoryIcon} from '../shared/category-icons';
import {categoryGlyph,categoryIconNames,categoryIconLabel,loadCategoryGlyphs,hydrateCategoryGlyphs} from './category-glyph';
import {openAnchoredPopover,closeAnchoredPopover} from './anchored-popover';
import {onRemoval} from './controls';
import {icon} from './ui';
import {t} from '../shared/i18n';

/** A searchable, progressively rendered catalog stays inside the category modal. */
export function bindCategoryIconPicker(root:HTMLElement,initial?:CategoryIcon){
 const trigger=root.querySelector<HTMLButtonElement>('#category-icon-trigger')!,dialog=root.closest('dialog')!;
 const panel=document.createElement('div');panel.id='category-icon-panel';panel.className='category-icon-panel';panel.popover='manual';panel.role='dialog';panel.setAttribute('aria-label',t('选择分类图标'));
 const label=document.createElement('label');label.className='category-icon-search';label.innerHTML=icon('search');const search=document.createElement('input');search.type='search';search.placeholder=t('搜索图标');search.setAttribute('aria-label',t('搜索图标'));label.append(search);
 const scroll=document.createElement('div');scroll.className='category-icon-scroll';
 const grid=document.createElement('div');grid.className='category-icon-grid';grid.role='group';grid.setAttribute('aria-label','Lucide');
 const sentinel=document.createElement('div');sentinel.className='category-icon-sentinel';
 const status=document.createElement('p');status.className='category-icon-empty';status.role='status';status.hidden=true;scroll.append(grid,sentinel,status);panel.append(label,scroll);dialog.append(panel);
 const labels=categoryIconNames();let selected:CategoryIcon=categoryIconValid(initial)?initial:'folder',open=false,loaded=false,matches:CategoryIcon[]=[],offset=0;
 const sync=()=>{trigger.dataset.icon=selected;trigger.innerHTML=categoryGlyph(selected)+`<span>${categoryIconLabel(selected)}</span>`+icon('chevron-down');for(const button of grid.querySelectorAll<HTMLButtonElement>('button'))button.setAttribute('aria-pressed',String(button.dataset.categoryIcon===selected));};
 const close=(restore=false)=>{if(!open)return;open=false;closeAnchoredPopover(panel);trigger.setAttribute('aria-expanded','false');document.removeEventListener('pointerdown',outside,true);if(restore)trigger.focus({preventScroll:true});};
 const outside=(event:PointerEvent)=>{if(!panel.contains(event.target as Node)&&!trigger.contains(event.target as Node))close();};
 const append=()=>{if(!open||!loaded||offset>=matches.length)return;const fragment=document.createDocumentFragment();for(const name of matches.slice(offset,offset+120)){const button=document.createElement('button');button.type='button';button.className='icon-button quiet';button.dataset.categoryIcon=name;button.title=(labels[name]||categoryIconLabel(name))+' · '+name;button.setAttribute('aria-label',button.title);button.setAttribute('aria-pressed',String(name===selected));button.innerHTML=categoryGlyph(name);button.onclick=()=>{selected=name;sync();trigger.dispatchEvent(new Event('change',{bubbles:true}));close(true);};fragment.append(button);}offset=Math.min(offset+120,matches.length);grid.append(fragment);sentinel.hidden=offset>=matches.length;};
 const filter=()=>{if(!loaded)return;const terms=search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);matches=categoryIcons.filter(name=>{const text=`${labels[name]||''} ${name} ${name.replace(/-/g,' ')} ${name.replace(/-/g,'')}`.toLocaleLowerCase();return terms.every(term=>text.includes(term));});offset=0;grid.replaceChildren();scroll.scrollTop=0;status.hidden=matches.length>0;status.textContent=t('没有匹配的图标');append();};search.oninput=filter;
 const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))append();},{root:scroll,rootMargin:'120px'});observer.observe(sentinel);
 scroll.addEventListener('scroll',()=>{if(scroll.scrollTop+scroll.clientHeight>=scroll.scrollHeight-120)append();});
 const load=async()=>{if(loaded){filter();return;}grid.setAttribute('aria-busy','true');status.hidden=false;status.textContent=t('正在加载图标…');try{await loadCategoryGlyphs();loaded=true;if(!trigger.isConnected)return;sync();if(open)filter();}catch(error){if(trigger.isConnected){status.hidden=false;status.textContent=t('图标加载失败，重新打开以重试');trigger.dispatchEvent(new CustomEvent('category-icon:error',{bubbles:true,detail:error}));}}finally{grid.removeAttribute('aria-busy');}};
 trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls',panel.id);trigger.setAttribute('aria-expanded','false');trigger.onclick=()=>{if(open){close(true);return;}search.value='';open=true;openAnchoredPopover(panel,trigger,344,360);trigger.setAttribute('aria-expanded','true');document.addEventListener('pointerdown',outside,true);search.focus({preventScroll:true});void load();};
 panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}else if(event.key==='Tab'){const controls=[search,...grid.querySelectorAll<HTMLButtonElement>('button')],first=controls[0],last=controls.at(-1)!;if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}else if(event.target===search&&event.key==='ArrowDown'){event.preventDefault();grid.querySelector<HTMLButtonElement>('button')?.focus();}});
 const dialogClosed=()=>close();dialog.addEventListener('close',dialogClosed);onRemoval(trigger,()=>{observer.disconnect();close();panel.remove();dialog.removeEventListener('close',dialogClosed);});sync();hydrateCategoryGlyphs(trigger);return ()=>selected;
}
