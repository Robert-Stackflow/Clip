/** Normalize controls to One's component DOM before dynamic pages are measured. */
export function migrateOneSkeleton(root:HTMLElement=document.body){
 const find=(selector:string)=>[...(root.matches(selector)?[root]:[]),...root.querySelectorAll<HTMLElement>(selector)];
 for(const span of find('.switch>span'))span.classList.add('switch-track');
 for(const tabs of find('#filters,.source-tabs,.mode,.segmented,.type-choices'))tabs.classList.add('tabs');
 for(const input of find('.hotkey-input,input[data-value][readonly],#replies-shortcut')){
  if(input.closest('.shortcut-control'))continue;const field=document.createElement('span');field.className='shortcut-control';input.before(field);field.append(input);
 }
 for(const row of find('.setting-row'))row.firstElementChild?.classList.add('setting-copy');
}
export function observeOneSkeleton(){migrateOneSkeleton();new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof HTMLElement)migrateOneSkeleton(node);}).observe(document.body,{subtree:true,childList:true});}
