import {t} from '../shared/i18n';
import {icon,iconButton} from './ui';
import {bindSearchFields} from './one-search';
import {openAnchoredPopover,closeAnchoredPopover} from './anchored-popover';

/** Move live controls into One's rail, content stage and command bar. */
export function collectionLayout(root:HTMLElement){
 bindSearchFields(root);
 const collection=root.querySelector<HTMLElement>('.collection')!,workspace=collection.querySelector<HTMLElement>('.workspace')!,results=collection.querySelector<HTMLElement>('#results')!;
 const rail=document.createElement('section');rail.className='collection-rail';rail.setAttribute('aria-label',t('剪贴板记录'));results.before(rail);rail.append(results);
 const chips=collection.querySelector<HTMLElement>('#filter-chips');
 const drop=collection.querySelector<HTMLElement>('#shelf-drop');if(drop)workspace.append(drop);
 const toolbar=collection.querySelector<HTMLElement>('.collection-toolbar')!,filter=collection.querySelector<HTMLElement>('.filterbar')!,controls=document.createElement('div');controls.className='collection-controls';toolbar.before(controls);controls.append(toolbar,filter);if(chips)controls.append(chips);const source=collection.querySelector<HTMLElement>('#source-filters');if(source)filter.append(source);
 const filterActions=document.createElement('div');filterActions.id='filter-actions';filterActions.className='collection-filter-actions';filterActions.hidden=true;filter.append(filterActions);
 workspace.classList.add('collection-canvas');collection.querySelectorAll<HTMLElement>('.heading-actions>button:not(.primary)').forEach(button=>button.classList.add('quiet'));
}
export function detailLayout(root:HTMLElement,bind=true){
 const identity=root.querySelector<HTMLElement>('.preview-heading>.detail-kind'),application=identity?.querySelector<HTMLElement>(':scope>.source-icon');if(identity&&application){const name=application.nextSibling,group=document.createElement('span');group.className='preview-application';application.before(group);group.append(application);if(name?.nodeType===Node.TEXT_NODE){const label=document.createElement('span');label.textContent=name.textContent;group.append(label);name.remove();}}
 const top=root.querySelector<HTMLElement>('.detail-top'),actions=root.querySelector<HTMLElement>('.detail-actions'),meta=root.querySelector<HTMLElement>('.detail-meta'),more=root.querySelector<HTMLDetailsElement>('.detail-more'),tools=top?.querySelector<HTMLElement>('.detail-tools');
 if(!top||!actions)return;const footer=document.createElement('div');footer.className='preview-commandbar';actions.before(footer);footer.append(actions);
 root.classList.toggle('record-detail',!!meta);
 if(meta){
  const source=identity?.querySelector('.preview-application');if(source)meta.prepend(source);
  top.querySelector('.preview-title')?.remove();const kind=identity?.querySelector('.preview-kind');if(kind)identity!.replaceChildren(...kind.childNodes);
  meta.className='preview-metadata';footer.prepend(meta);
 }
 if(more&&tools){tools.append(more);more.open=false;const summary=more.querySelector<HTMLElement>('summary')!;summary.setAttribute('aria-expanded','false');summary.setAttribute('aria-label',t('更多操作'));summary.title=t('更多操作');summary.innerHTML=icon('lucide:more');const popup=document.createElement('div');popup.className='preview-menu';popup.setAttribute('role','menu');popup.setAttribute('aria-label',t('更多操作'));more.append(popup);for(const group of Array.from(more.children).filter(node=>node!==summary&&node!==popup))popup.append(group);for(const button of popup.querySelectorAll<HTMLButtonElement>('button')){button.classList.remove('icon-button','small');button.classList.add('preview-menu-action');button.setAttribute('role','menuitem');if(!button.querySelector('span')){const label=document.createElement('span');label.textContent=button.getAttribute('aria-label')||button.title;button.append(label);}}}
 root.classList.add('content-stage');groupDetailActions(root);if(bind)bindDetailLayout(root);
}
const boundMore=new WeakSet<HTMLDetailsElement>(),boundMoreButtons=new WeakSet<HTMLButtonElement>(),boundMoreToggles=new WeakSet<HTMLButtonElement>();
function groupDetailActions(root:HTMLElement){
 const more=root.querySelector<HTMLDetailsElement>('.detail-more'),container=more?.querySelector<HTMLElement>('.secondary-actions');if(!more||!container)return;
 const text=more.querySelector('.text-tool-actions');if(text){container.append(...Array.from(text.children));text.remove();}
 const buttons=Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
 const groups:[string,string,string[]][]=[
  ['image',t('图片处理'),['ai-image']],
  ['text',t('文字处理'),['plain','translate','summarize','rewrite','run-command','run-script']],
  ['hosting',t('图床'),['upload-image','reupload-image']],
  ['organize',t('整理与收纳'),['enqueue','dequeue','queue-up','queue-down','split','save-reply','shelf-item','organize-manual-categories']],
  ['share',t('分享与导出'),['share-record','private-record','export-image']],
  ['record',t('记录管理'),['show-context','content-info','delete']],
 ];
 for(const [key,title,ids]of groups){const available=buttons.filter(button=>ids.includes(button.id));if(!available.length)continue;let section=container.querySelector<HTMLElement>(`[data-action-group="${key}"]`);if(!section){section=document.createElement('section');section.className='preview-action-group';section.dataset.actionGroup=key;section.setAttribute('role','group');section.setAttribute('aria-label',title);const heading=document.createElement('h4');heading.textContent=title;const list=document.createElement('div');list.className='preview-action-list';section.append(heading,list);container.append(section);}const list=section.querySelector('.preview-action-list')!;for(const button of available){button.classList.remove('icon-button','small');button.classList.add('preview-menu-action');button.setAttribute('role','menuitem');if(!button.querySelector('span')){const label=document.createElement('span');label.textContent=button.getAttribute('aria-label')||button.title;button.append(label);}list.append(button);}}
 more.classList.add('grouped-actions');
 const summary=more.querySelector<HTMLElement>('summary')!;
 if(!summary.querySelector('button')){summary.removeAttribute('title');summary.removeAttribute('data-tooltip');summary.tabIndex=-1;summary.innerHTML=iconButton('more-actions',t('更多操作'),'lucide:more');const trigger=summary.querySelector('button')!;trigger.setAttribute('aria-haspopup','menu');}
}
export function bindDetailLayout(root:HTMLElement){const more=root.querySelector<HTMLDetailsElement>('.detail-more');if(!more)return;
 groupDetailActions(root);
 const trigger=more.querySelector<HTMLButtonElement>('#more-actions')!;if(!boundMoreToggles.has(trigger)){boundMoreToggles.add(trigger);trigger.addEventListener('click',event=>{event.preventDefault();more.open=!more.open;});trigger.addEventListener('keydown',event=>{if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;event.preventDefault();event.stopPropagation();more.open=true;sync();const buttons=Array.from(more.querySelectorAll<HTMLButtonElement>('.preview-menu button:not(:disabled)'));(event.key==='ArrowUp'?buttons.at(-1):buttons[0])?.focus({preventScroll:true});});}
 const sync=()=>{const anchor=more.querySelector<HTMLElement>('#more-actions')!,popup=more.querySelector<HTMLElement>('.preview-menu')!;anchor.setAttribute('aria-expanded',String(more.open));more.querySelector('summary')!.setAttribute('aria-expanded',String(more.open));if(more.open)openAnchoredPopover(popup,anchor,460,620);else closeAnchoredPopover(popup);};
 if(!boundMore.has(more)){boundMore.add(more);more.addEventListener('toggle',sync);}sync();
 for(const button of more.querySelectorAll<HTMLButtonElement>('.preview-menu button'))if(!boundMoreButtons.has(button)){boundMoreButtons.add(button);button.addEventListener('click',()=>more.open=false);}
}
function closePreviewPopovers(except?:Element){for(const more of document.querySelectorAll<HTMLDetailsElement>('.detail-more[open]'))if(except?.closest('.detail-more')!==more){more.open=false;const popup=more.querySelector<HTMLElement>('.preview-menu');if(popup)closeAnchoredPopover(popup);}}
document.addEventListener('pointerdown',event=>closePreviewPopovers(event.target as Element));
document.addEventListener('click',event=>{const target=event.target as Element;if(target.closest('.detail-more>summary'))closePreviewPopovers(target);});
document.addEventListener('keydown',event=>{const target=event.target as HTMLElement,more=target.closest<HTMLDetailsElement>('.detail-more[open]');if(event.key==='Escape'&&(more||document.querySelector('.detail-more[open]'))){event.preventDefault();event.stopImmediatePropagation();const button=more?.querySelector<HTMLElement>('#more-actions')||document.querySelector<HTMLElement>('.detail-more[open] #more-actions');closePreviewPopovers();button?.focus();return;}if(more&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopPropagation();const buttons=Array.from(more.querySelectorAll<HTMLButtonElement>('.preview-menu button:not(:disabled)')),index=buttons.indexOf(target as HTMLButtonElement),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:index<0?(event.key==='ArrowDown'?0:buttons.length-1):(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}},true);
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
   for(const child of children){if(child.classList.contains('tools-section-heading')||child.id==='history-vault'||child.classList.contains('backup-status')||child.id==='backup-entries'||child.classList.contains('checkpoint-workbench')){flush();}else batch.push(child);}flush();
  }
  if(page==='sync')panel.querySelector<HTMLElement>('#sync-live')?.classList.add('device-workbench');
 }
 if(page==='web'&&!root.querySelector('.web-setup-panel,.web-content-card')){
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
