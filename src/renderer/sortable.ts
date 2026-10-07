interface SortableOptions {
  itemSelector:string;
  handleSelector:string;
  id(item:HTMLElement):string;
  enabled?:()=>boolean;
  commit(ids:string[]):void|Promise<void>;
}

const bindings=new WeakMap<HTMLElement,()=>void>();

function animate(items:HTMLElement[],before:Map<HTMLElement,DOMRect>){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  for(const item of items){const old=before.get(item),next=item.getBoundingClientRect();if(!old)continue;const x=old.left-next.left,y=old.top-next.top;if(Math.abs(x)<.5&&Math.abs(y)<.5)continue;item.getAnimations().forEach(animation=>animation.cancel());item.animate([{transform:`translate(${x}px,${y}px)`},{transform:'translate(0,0)'}],{duration:190,easing:'cubic-bezier(.2,.8,.2,1)'});}
}

export function bindSortable(container:HTMLElement,options:SortableOptions){
  bindings.get(container)?.();
  let source:HTMLElement|undefined,dragProxy:HTMLElement|undefined,start:string[]=[],dropped=false,placed=false;
  const items=()=>Array.from(container.querySelectorAll<HTMLElement>(`:scope > ${options.itemSelector}`));
  const ids=()=>items().map(options.id);
  const restore=()=>{const byId=new Map(items().map(item=>[options.id(item),item]));const before=new Map(items().map(item=>[item,item.getBoundingClientRect()]));for(const id of start){const item=byId.get(id);if(item)container.append(item);}animate(items(),before);};
  const clean=()=>{source?.classList.remove('sort-drag-source');container.classList.remove('sort-list-active');dragProxy?.remove();source=dragProxy=undefined;start=[];};
  const dragstart=(event:DragEvent)=>{if(options.enabled&&!options.enabled()||!(event.target instanceof Element))return;const handle=event.target.closest<HTMLElement>(options.handleSelector),item=handle?.closest<HTMLElement>(options.itemSelector);if(!handle||!item||item.parentElement!==container||!event.dataTransfer)return;source=item;start=ids();dropped=placed=false;source.classList.add('sort-drag-source');container.classList.add('sort-list-active');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',options.id(item));dragProxy=document.createElement('span');dragProxy.className='sort-drag-proxy';document.body.append(dragProxy);event.dataTransfer.setDragImage(dragProxy,0,0);};
  const place=(event:DragEvent)=>{if(!source||!(event.target instanceof Element))return false;const target=event.target.closest<HTMLElement>(options.itemSelector);if(!target||target===source||target.parentElement!==container)return false;const sourceRect=source.getBoundingClientRect(),targetRect=target.getBoundingClientRect(),sameRow=Math.abs(sourceRect.top+sourceRect.height/2-(targetRect.top+targetRect.height/2))<Math.min(sourceRect.height,targetRect.height)*.55,hasPointer=event.clientX!==0||event.clientY!==0,startedBeforeTarget=start.indexOf(options.id(source))<start.indexOf(options.id(target)),pointer=sameRow?event.clientX:event.clientY,center=sameRow?targetRect.left+targetRect.width/2:targetRect.top+targetRect.height/2,size=sameRow?targetRect.width:targetRect.height,beforeTarget=!hasPointer||Math.abs(pointer-center)<size*.18?!startedBeforeTarget:pointer<center;if(beforeTarget&&source.nextElementSibling===target||!beforeTarget&&target.nextElementSibling===source)return true;const nodes=items(),positions=new Map(nodes.map(item=>[item,item.getBoundingClientRect()]));container.insertBefore(source,beforeTarget?target:target.nextElementSibling);animate(nodes,positions);return true;};
  const dragover=(event:DragEvent)=>{if(!source)return;event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';placed=place(event)||placed;};
  const drop=(event:DragEvent)=>{if(!source)return;event.preventDefault();if(!placed)place(event);dropped=true;const next=ids(),changed=next.some((id,index)=>id!==start[index]);clean();if(changed)void Promise.resolve(options.commit(next));};
  const dragend=()=>{if(!source)return;if(!dropped)restore();clean();};
  const keydown=(event:KeyboardEvent)=>{if(options.enabled&&!options.enabled()||!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key)||!(event.target instanceof Element))return;const handle=event.target.closest<HTMLElement>(options.handleSelector),item=handle?.closest<HTMLElement>(options.itemSelector);if(!handle||!item||item.parentElement!==container)return;const list=items(),index=list.indexOf(item),next=index+(event.key==='ArrowUp'?-1:1);if(next<0||next>=list.length)return;event.preventDefault();const positions=new Map(list.map(node=>[node,node.getBoundingClientRect()]));container.insertBefore(item,event.key==='ArrowUp'?list[next]:list[next].nextElementSibling);animate(list,positions);void Promise.resolve(options.commit(ids()));handle.focus({preventScroll:true});};
  container.addEventListener('dragstart',dragstart);container.addEventListener('dragover',dragover);container.addEventListener('drop',drop);container.addEventListener('dragend',dragend);container.addEventListener('keydown',keydown);
  for(const handle of container.querySelectorAll<HTMLElement>(options.handleSelector)){handle.draggable=true;handle.setAttribute('aria-keyshortcuts','Alt+ArrowUp Alt+ArrowDown');}
  const dispose=()=>{container.removeEventListener('dragstart',dragstart);container.removeEventListener('dragover',dragover);container.removeEventListener('drop',drop);container.removeEventListener('dragend',dragend);container.removeEventListener('keydown',keydown);dragProxy?.remove();};bindings.set(container,dispose);return dispose;
}
