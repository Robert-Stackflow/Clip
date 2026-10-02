import {t} from '../shared/i18n';
import {bindSearchFields} from './one-search';

/** Move live controls into One's rail, content stage and command bar. */
export function collectionLayout(root:HTMLElement){
 bindSearchFields(root);
 const collection=root.querySelector<HTMLElement>('.collection')!,workspace=collection.querySelector<HTMLElement>('.workspace')!,results=collection.querySelector<HTMLElement>('#results')!,footer=collection.querySelector<HTMLElement>('.collection-footer')!;
 const rail=document.createElement('section');rail.className='collection-rail';rail.setAttribute('aria-label',t('剪贴板记录'));results.before(rail);rail.append(results,footer);
 const toolbar=collection.querySelector<HTMLElement>('.collection-toolbar')!,filter=collection.querySelector<HTMLElement>('.filterbar')!,controls=document.createElement('div');controls.className='collection-controls';toolbar.before(controls);controls.append(toolbar,filter);
 workspace.classList.add('collection-canvas');collection.querySelectorAll<HTMLElement>('.heading-actions>button:not(.primary)').forEach(button=>button.classList.add('quiet'));
}
export function detailLayout(root:HTMLElement,bind=true){
 const top=root.querySelector<HTMLElement>('.detail-top'),actions=root.querySelector<HTMLElement>('.detail-actions'),meta=root.querySelector<HTMLElement>('.detail-meta'),more=root.querySelector<HTMLDetailsElement>('.detail-more');
 if(!top||!actions)return;const footer=document.createElement('div');footer.className='preview-commandbar';actions.before(footer);footer.append(actions);if(meta){footer.prepend(meta);meta.querySelector('button')?.classList.add('quiet');}
 if(more){more.open=false;more.querySelector<HTMLElement>('summary')?.setAttribute('aria-expanded','false');}
 root.classList.add('content-stage');
 if(bind)bindDetailLayout(root);
}
const boundMore=new WeakSet<HTMLDetailsElement>(),boundMoreButtons=new WeakSet<HTMLButtonElement>();
export function bindDetailLayout(root:HTMLElement){const more=root.querySelector<HTMLDetailsElement>('.detail-more');if(!more)return;
 if(!boundMore.has(more)){boundMore.add(more);more.addEventListener('toggle',()=>more.querySelector('summary')?.setAttribute('aria-expanded',String(more.open)));}
 for(const button of more.querySelectorAll('button'))if(!boundMoreButtons.has(button)){boundMoreButtons.add(button);button.addEventListener('click',()=>more.open=false);}
}
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
