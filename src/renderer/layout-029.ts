import {t} from '../shared/i18n';
import {icon} from './ui';
import {bindSearchFields} from './one-search';
import {openAnchoredPopover,closeAnchoredPopover} from './anchored-popover';

/** Move live controls into One's rail, content stage and command bar. */
export function collectionLayout(root:HTMLElement){
 bindSearchFields(root);
 const collection=root.querySelector<HTMLElement>('.collection')!,workspace=collection.querySelector<HTMLElement>('.workspace')!,results=collection.querySelector<HTMLElement>('#results')!;
 const rail=document.createElement('section');rail.className='collection-rail';rail.setAttribute('aria-label',t('剪贴板记录'));results.before(rail);rail.append(results);
 const drop=collection.querySelector<HTMLElement>('#shelf-drop');if(drop)workspace.append(drop);
 const toolbar=collection.querySelector<HTMLElement>('.collection-toolbar')!,filter=collection.querySelector<HTMLElement>('.filterbar')!,controls=document.createElement('div');controls.className='collection-controls';toolbar.before(controls);controls.append(toolbar,filter);const source=collection.querySelector<HTMLElement>('#source-filters');if(source)filter.append(source);
 const filterActions=document.createElement('div');filterActions.id='filter-actions';filterActions.className='collection-filter-actions';filterActions.hidden=true;filter.append(filterActions);
 workspace.classList.add('collection-canvas');collection.querySelectorAll<HTMLElement>('.heading-actions>button:not(.primary)').forEach(button=>button.classList.add('quiet'));
}
export function detailLayout(root:HTMLElement,bind=true){
 const identity=root.querySelector<HTMLElement>('.preview-heading>.detail-kind'),application=identity?.querySelector<HTMLElement>(':scope>.source-icon');if(identity&&application){const name=application.nextSibling,group=document.createElement('span');group.className='preview-application';application.before(group);group.append(application);if(name?.nodeType===Node.TEXT_NODE){const label=document.createElement('span');label.textContent=name.textContent;group.append(label);name.remove();}}
 const top=root.querySelector<HTMLElement>('.detail-top'),actions=root.querySelector<HTMLElement>('.detail-actions'),meta=root.querySelector<HTMLElement>('.detail-meta'),more=root.querySelector<HTMLDetailsElement>('.detail-more'),tools=top?.querySelector<HTMLElement>('.detail-tools');
 if(!top||!actions)return;const footer=document.createElement('div');footer.className='preview-commandbar';actions.before(footer);footer.append(actions);
 if(meta&&tools){tools.append(meta);const toggle=meta.querySelector<HTMLButtonElement>('button')!;toggle.className='icon-button quiet';toggle.title=toggle.getAttribute('aria-label')||t('记录信息');toggle.setAttribute('aria-label',t('记录信息'));toggle.innerHTML=icon('lucide:info');}
 if(more&&tools){tools.append(more);more.open=false;const summary=more.querySelector<HTMLElement>('summary')!;summary.setAttribute('aria-expanded','false');summary.setAttribute('aria-label',t('更多操作'));summary.title=t('更多操作');summary.innerHTML=icon('lucide:more');const popup=document.createElement('div');popup.className='preview-menu';popup.setAttribute('role','group');popup.setAttribute('aria-label',t('更多操作'));more.append(popup);for(const group of Array.from(more.children).filter(node=>node!==summary&&node!==popup))popup.append(group);for(const button of popup.querySelectorAll<HTMLButtonElement>('button')){button.classList.remove('icon-button','small');button.classList.add('preview-menu-action');if(!button.querySelector('span')){const label=document.createElement('span');label.textContent=button.getAttribute('aria-label')||button.title;button.append(label);}}}
 root.classList.add('content-stage');if(bind)bindDetailLayout(root);
}
const boundMore=new WeakSet<HTMLDetailsElement>(),boundMoreButtons=new WeakSet<HTMLButtonElement>();
export function bindDetailLayout(root:HTMLElement){const more=root.querySelector<HTMLDetailsElement>('.detail-more');if(!more)return;
 const sync=()=>{const anchor=more.querySelector<HTMLElement>('summary')!,popup=more.querySelector<HTMLElement>('.preview-menu')!;anchor.setAttribute('aria-expanded',String(more.open));if(more.open)openAnchoredPopover(popup,anchor);else closeAnchoredPopover(popup);};
 if(!boundMore.has(more)){boundMore.add(more);more.addEventListener('toggle',sync);}sync();
 const info=root.querySelector<HTMLElement>('#record-info'),anchor=root.querySelector<HTMLElement>('#record-info-toggle');if(info&&anchor&&!info.hidden)openAnchoredPopover(info,anchor,360,340);
 for(const button of more.querySelectorAll('button'))if(!boundMoreButtons.has(button)){boundMoreButtons.add(button);button.addEventListener('click',()=>more.open=false);}
}
export function toggleRecordInfo(info:HTMLElement,anchor:HTMLElement){info.hidden=!info.hidden;anchor.setAttribute('aria-expanded',String(!info.hidden));if(info.hidden)closeAnchoredPopover(info);else openAnchoredPopover(info,anchor,360,340);}
function closePreviewPopovers(except?:Element){for(const more of document.querySelectorAll<HTMLDetailsElement>('.detail-more[open]'))if(!except?.closest('.detail-more')||except.closest('.detail-more')!==more){more.open=false;const popup=more.querySelector<HTMLElement>('.preview-menu');if(popup)closeAnchoredPopover(popup);}for(const info of document.querySelectorAll<HTMLElement>('.record-info:not([hidden])'))if(except?.closest('.detail-meta')!==info.parentElement){info.hidden=true;closeAnchoredPopover(info);info.parentElement?.querySelector('button')?.setAttribute('aria-expanded','false');}}
document.addEventListener('pointerdown',event=>closePreviewPopovers(event.target as Element));
document.addEventListener('click',event=>{const target=event.target as Element;if(target.closest('.detail-more>summary')||target.closest('#record-info-toggle'))closePreviewPopovers(target);});
document.addEventListener('keydown',event=>{const target=event.target as HTMLElement,more=target.closest<HTMLDetailsElement>('.detail-more[open]'),info=document.querySelector<HTMLElement>('.record-info:not([hidden])');if(event.key==='Escape'&&(more||info||document.querySelector('.detail-more[open]'))){event.preventDefault();event.stopImmediatePropagation();const button=more?.querySelector<HTMLElement>('summary')||info?.parentElement?.querySelector<HTMLElement>('button')||document.querySelector<HTMLElement>('.detail-more[open]>summary');closePreviewPopovers();button?.focus();return;}if(more&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopPropagation();const buttons=Array.from(more.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')),index=buttons.indexOf(target as HTMLButtonElement),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}},true);
document.addEventListener('focusin',event=>{const target=event.target as Element;if(!target.closest('.detail-top'))closePreviewPopovers();});
function group(nodes:Element[],className='settings-card utility-card'){
 if(!nodes.length)return;const card=document.createElement('section');card.className=className;nodes[0].before(card);nodes.forEach(node=>card.append(node));
}
export function utilityLayout(page:string){
 const root=document.querySelector<HTMLElement>('#content .tools-page');if(!root)return;root.dataset.layout=page;bindSearchFields(root);
 for(const panel of root.querySelectorAll<HTMLElement>('.section-panel')){
  if(panel.dataset.grouped)continue;panel.dataset.grouped='true';
  if(page==='tools'){
   if(panel.querySelector('.tools-section-heading'))panel.classList.add('tool-workbench');
   if(!panel.querySelector('.tool-cards'))group(Array.from(panel.children).filter(node=>!node.classList.contains('tools-section-heading')));
  }
  if(page==='data'){
   const children=Array.from(panel.children);let batch:Element[]=[];const flush=()=>{group(batch);batch=[];};
   for(const child of children){if(child.classList.contains('tools-section-heading')||child.id==='history-vault'||child.classList.contains('backup-status')||child.id==='backup-entries'){flush();}else batch.push(child);}flush();
  }
  if(page==='sync')panel.querySelector<HTMLElement>('#sync-live')?.classList.add('device-workbench');
 }
 if(page==='web'){
  const body=root.querySelector<HTMLElement>('.tools-scroll')!,layout=body.querySelector<HTMLElement>('.sharing-layout');
  if(layout){layout.classList.add('web-workbench');for(const section of Array.from(layout.children)){
   const children=Array.from(section.children),title=children.findIndex(node=>node.classList.contains('section-label'));if(title>=0)group(children.slice(title+1),'settings-card web-card');
  }}else group(Array.from(body.children),'settings-card web-setup');
 }
}
export function modalLayout(dialog:HTMLDialogElement){
 const body=dialog.querySelector<HTMLElement>('.modal-body');if(!body)return;dialog.setAttribute('aria-labelledby','modal-title');dialog.querySelector('h2')!.id='modal-title';
 const fields=Array.from(body.children);let rows:Element[]=[];const flush=()=>{group(rows,'settings-card modal-fields');rows=[];};
 for(const field of fields){if(field.classList.contains('field')&&!field.querySelector('textarea'))rows.push(field);else flush();}flush();
}
