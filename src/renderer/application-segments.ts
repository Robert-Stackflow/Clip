import {keyedMarkup} from './markup';
import {customControls,onRemoval} from './controls';
import {appIdentity,hydrateAppIcons} from './source-apps';
import {icon} from './ui';
import {t} from '../shared/i18n';
export interface SourceEntry{key:string;name:string;count:number}
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const controllers=new WeakMap<HTMLElement,{update(entries:SourceEntry[],selected:string,choose:(key:string)=>void):void}>();
/** One segments and select popup share a row. Resize keeps the selected app visible. */
export function applicationSegments(root:HTMLElement,entries:SourceEntry[],selected:string,choose:(key:string)=>void){
 let controller=controllers.get(root);if(!controller){let current:SourceEntry[]=[],active='',select:(key:string)=>void=()=>{},signature='',frame=0,compactAll=false,forced='',previousVisible:string[]=[],measuredFont='';const widthKeys=new Map<string,string>(),widths=new Map<string,number>(),measure=document.createElement('div');measure.className='source-measure';measure.setAttribute('aria-hidden','true');document.body.append(measure);
  const html=(entry:SourceEntry,measuring=false)=>`<button class="source-segment quiet ${!measuring&&entry.key===':all'&&compactAll?'source-all-compact':''} ${!measuring&&entry.key===forced?'source-forced':''} ${active===entry.key?'selected':''}" role="tab" aria-label="${escape(entry.name.replace(/\.exe$/i,''))}" title="${escape(entry.name.replace(/\.exe$/i,''))}" aria-selected="${active===entry.key}" data-source="${encodeURIComponent(entry.key)}">${entry.key===':all'?icon('lucide:app'):appIdentity(entry.name)}<span class="source-label">${escape(entry.name.replace(/\.exe$/i,''))}</span><small>${entry.count}</small></button>`;
  const fontKey=()=>{const style=getComputedStyle(root);return style.font+style.getPropertyValue('--text-scale');};
  const measureWidths=(font=fontKey())=>{
   const keys=new Set(current.map(entry=>entry.key)),changed=current.filter(entry=>widthKeys.get(entry.key)!==JSON.stringify([entry.name,String(entry.count).length,font]));
   measure.innerHTML=changed.map(entry=>html(entry,true).replace(/\sdata-source="[^"]*"/,'').replace(/\srole="tab"/,'').replace(/\saria-selected="[^"]*"/,'')).join('');
   Array.from(measure.children).forEach((node,index)=>{const entry=changed[index];widths.set(entry.key,node.getBoundingClientRect().width);widthKeys.set(entry.key,JSON.stringify([entry.name,String(entry.count).length,font]));});
   measure.replaceChildren();measuredFont=font;for(const key of widthKeys.keys())if(!keys.has(key)){widthKeys.delete(key);widths.delete(key);}
  };
  const draw=()=>{
   frame=0;if(!root.isConnected||!current.length)return;
   const font=fontKey();if(font!==measuredFont)measureWidths(font);
   const parent=root.parentElement!,siblings=Array.from(parent.children).filter(node=>node!==root&&node.getClientRects().length),gap=parseFloat(getComputedStyle(parent).columnGap)||0;
   const available=parent.clientWidth-siblings.reduce((sum,node)=>sum+Math.max(node.getBoundingClientRect().width,node.id==='filters'?node.scrollWidth:0),0)-siblings.length*gap;
   if(!parent.clientWidth)return;
   const size=(entry:SourceEntry)=>widths.get(entry.key)||100,total=current.reduce((sum,entry)=>sum+size(entry),0)+Math.max(0,current.length-1)*3+6,width=Math.max(140,Math.min(available,total));
   root.style.width=width+'px';
   const all=current[0],selectedEntry=current.find(entry=>entry.key===active),budget=width-6-(total>width+.5?33:0),visible:SourceEntry[]=[all];
   compactAll=size(all)>budget||!!selectedEntry&&selectedEntry!==all&&size(all)+size(selectedEntry)+3>budget;
   let used=compactAll?30:size(all);forced='';
   const byKey=new Map(current.slice(1).map(entry=>[entry.key,entry])),ranked:SourceEntry[]=[];
   // Keep existing visible buttons in place; hidden selections replace the last one.
   for(const key of previousVisible){const entry=byKey.get(key);if(entry){ranked.push(entry);byKey.delete(key);}}
   ranked.push(...byKey.values());
   for(const entry of ranked){if(used+size(entry)+3<=budget){visible.push(entry);used+=size(entry)+3;}}
   if(selectedEntry&&selectedEntry!==all&&!visible.includes(selectedEntry)){
    while(visible.length>1&&used+size(selectedEntry)+3>budget)used-=size(visible.pop()!)+3;
    visible.push(selectedEntry);
    if(used+size(selectedEntry)+3>budget){forced=selectedEntry.key;root.style.setProperty('--forced-app-width',Math.max(30,budget-used-3)+'px');}
   }
   previousVisible=visible.slice(1).map(entry=>entry.key);
   const shown=new Set(visible.map(entry=>entry.key)),hidden=current.filter(entry=>!shown.has(entry.key)),key=JSON.stringify([visible.map(entry=>[entry.key,entry.name,entry.count]),hidden.map(entry=>[entry.key,entry.name,entry.count]),active,compactAll,forced]);if(key===signature)return;signature=key;
   keyedMarkup(root,[...visible.map(entry=>({key:entry.key,html:html(entry)})),...(hidden.length?[{key:':overflow',html:`<span class="source-overflow"><select id="source-overflow" aria-label="${t('更多应用')}">${hidden.map(entry=>`<option value="${encodeURIComponent(entry.key)}" data-source-app="${escape(entry.name)}">${escape(entry.name.replace(/\.exe$/i,''))} · ${entry.count}</option>`).join('')}</select></span>`}]:[])]);
   for(const button of root.querySelectorAll<HTMLButtonElement>('[data-source]'))button.onclick=()=>select(decodeURIComponent(button.dataset.source!));
   const overflow=root.querySelector<HTMLSelectElement>('#source-overflow');if(overflow){overflow.selectedIndex=-1;overflow.onchange=()=>select(decodeURIComponent(overflow.value));customControls(root);const trigger=root.querySelector<HTMLButtonElement>('#source-overflow-trigger')!;trigger.classList.add('source-overflow-trigger');trigger.title=t('更多应用');}
   void hydrateAppIcons(root);
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(draw);},observer=new ResizeObserver(schedule);observer.observe(root.parentElement!);for(const node of root.parentElement!.children)observer.observe(node);const fonts=()=>{widthKeys.clear();widths.clear();measureWidths();signature='';schedule();};document.fonts.addEventListener('loadingdone',fonts);onRemoval(root,()=>{observer.disconnect();cancelAnimationFrame(frame);measure.remove();document.fonts.removeEventListener('loadingdone',fonts);});
  controller={update(entries,selected,choose){current=entries;active=selected;select=choose;measureWidths();schedule();}};controllers.set(root,controller);
 }controller.update(entries,selected,choose);
}
