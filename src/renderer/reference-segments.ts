import {customControls} from './controls';

/** Keep the selected segment visible and collect the remaining tabs in One's select popup. */
export function referenceSegments(group:HTMLElement){
 const viewport=group.parentElement!,buttons=Array.from(group.querySelectorAll<HTMLButtonElement>('[data-tab]'));
 const measure=document.createElement('div');measure.className='reference-segment-measure';measure.setAttribute('aria-hidden','true');
 for(const button of buttons){const clone=button.cloneNode(true) as HTMLButtonElement;clone.removeAttribute('data-tab');clone.removeAttribute('id');clone.tabIndex=-1;measure.append(clone);}
 document.body.append(measure);
 const overflow=document.createElement('span');overflow.className='source-overflow reference-overflow';overflow.hidden=true;
 const select=document.createElement('select');select.id='reference-overflow';select.setAttribute('aria-label',document.documentElement.lang==='en'?'More categories':'更多分类');overflow.append(select);group.append(overflow);
 customControls(overflow);const trigger=overflow.querySelector<HTMLButtonElement>('button')!;trigger.classList.add('source-overflow-trigger');
 let frame=0,disposed=false,signature='';
 const draw=()=>{
  frame=0;if(disposed||!viewport.clientWidth)return;
  for(let index=0;index<buttons.length;index++)if(measure.children[index].innerHTML!==buttons[index].innerHTML)measure.children[index].innerHTML=buttons[index].innerHTML;
  const widths=Array.from(measure.children,node=>node.getBoundingClientRect().width),gap=2,padding=6,available=viewport.clientWidth;
  const selected=Math.max(0,buttons.findIndex(button=>button.classList.contains('active')));
  const total=widths.reduce((sum,width)=>sum+width,0)+gap*(buttons.length-1)+padding;
  const budget=Math.max(0,available-padding-(total>available?36:0));
  const visible=new Set<number>([selected]);let used=Math.min(widths[selected],budget);
  for(let index=0;index<buttons.length;index++)if(index!==selected&&used+widths[index]+gap<=budget){visible.add(index);used+=widths[index]+gap;}
  const hidden=buttons.filter((_,index)=>!visible.has(index));
  buttons.forEach((button,index)=>{button.hidden=!visible.has(index);button.style.maxWidth=index===selected?Math.max(0,budget)+'px':'';});
  overflow.hidden=!hidden.length;
  const label=(button:HTMLButtonElement)=>Array.from(button.children,node=>node.textContent).join(' · ');
  const next=hidden.map(button=>[button.dataset.tab,label(button)]).join('|');
  if(next!==signature){signature=next;select.replaceChildren(...hidden.map(button=>new Option(label(button),button.dataset.tab!)));select.selectedIndex=-1;}
  group.dataset.adaptiveReady='true';
 };
 const schedule=()=>{if(!disposed&&!frame)frame=requestAnimationFrame(draw);};
 select.onchange=()=>{const selected=buttons.find(button=>button.dataset.tab===select.value);selected?.click();schedule();requestAnimationFrame(()=>{if(!disposed)selected?.focus({preventScroll:true});});};
 const resize=new ResizeObserver(schedule);resize.observe(viewport);resize.observe(measure);
 const changed=new MutationObserver(schedule);changed.observe(group,{subtree:true,attributes:true,attributeFilter:['class','aria-pressed'],childList:true,characterData:true});
 document.fonts.addEventListener('loadingdone',schedule);schedule();
 return ()=>{disposed=true;resize.disconnect();changed.disconnect();cancelAnimationFrame(frame);measure.remove();document.fonts.removeEventListener('loadingdone',schedule);};
}
