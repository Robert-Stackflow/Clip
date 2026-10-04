import {referenceCatalog,groupLabel,toneGlyph,tx,type Entry} from './reference-catalog';
import {cheatTopics} from './cheatsheet-data';
import {filterCheatSections,mountCheatDocument} from './cheatsheet-renderer';
import {formatNumber,setInterfaceLanguage} from '../shared/i18n';
import {icon,registerIcons} from './ui';
import {Copy,Search} from 'lucide';
import {referenceSegments} from './reference-segments';
import {mountEmojiFont} from './emoji-font';
import {copyTextValue} from './copy-text';
registerIcons({copy:Copy,search:Search});
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const anchorKey=(value:string)=>value.trim().toLocaleLowerCase().replace(/\s+/g,'-');
const emojiGlyph=(glyph:string)=>{
 const pair=Array.from(glyph),regional=pair.length===2&&pair.every(char=>{const point=char.codePointAt(0)!;return point>=0x1F1E6&&point<=0x1F1FF;});
 const flag=/^\u{1F3F4}[\u{E0061}-\u{E007A}]+\u{E007F}$/u.test(glyph);
 const visual=regional?String.fromCodePoint(0xE000+(pair[0].codePointAt(0)!-0x1F1E6)*26+pair[1].codePointAt(0)!-0x1F1E6):'';
 return `<span class="reference-emoji-glyph${regional||flag?' reference-emoji-flag':''}" data-emoji="${esc(glyph)}"${visual?` data-flag-render="${visual}"`:''} aria-hidden="true">${esc(glyph)}</span>`;
};
const mimeSpecifications=(entry:Entry)=>entry.specifications?.length?`<div class="reference-detail-label">${tx('登记参考','Registration references')}</div><div class="reference-mime-specifications">${entry.specifications.map(([id,title])=>`<div><b>${esc(id)}</b><span>${esc(title)}</span></div>`).join('')}</div>`:'';

type Row={top:number;height:number;group:string;title?:string;items?:{entry:Entry;index:number}[]};
type Section={group:string;top:number;count:number};

/** A bounded row window over one continuous catalog, including off-screen category anchors. */
export function mountReference(root:HTMLElement,kind:'symbols'|'cheats',notify:(text:string)=>void){
 window.clipperAppearance?.retainFontResources?.();
 setInterfaceLanguage(document.documentElement.lang==='en'?'en':'zh-CN');
 const catalog=referenceCatalog();let active=kind==='symbols'?'emoji':'git',tone=0,disposed=false;
 const toneOverrides=new WeakMap<Entry,number>(),variantOverrides=new WeakMap<Entry,string>(),selectedGlyph=(entry:Entry)=>variantOverrides.get(entry)||toneGlyph(entry,toneOverrides.get(entry)??tone);
 let rows:Row[]=[],sections:Section[]=[],entries:Entry[]=[],columns=1,frame=0,queryTimer:ReturnType<typeof setTimeout>|undefined;
 let tooltipTimer:ReturnType<typeof setTimeout>|undefined,scrollTipTimer:ReturnType<typeof setTimeout>|undefined,tooltipAnchor:HTMLElement|undefined,currentCategory='',focusIndex=0,pointer:{x:number;y:number}|undefined,tipGlyph='',awaitPointer=false;
 let cheatDocument:ReturnType<typeof mountCheatDocument>|undefined;
 let navigationFrame=0,navigationGroup:string|undefined;
 const cancelNavigation=()=>{cancelAnimationFrame(navigationFrame);navigationFrame=0;navigationGroup=undefined;};
 const mounted=new Map<number,HTMLElement>();
 const tip=document.createElement('div');tip.className='reference-popover';tip.hidden=true;tip.id='reference-hover-details';tip.setAttribute('role','dialog');tip.setAttribute('aria-label',tx('符号详情','Symbol details'));document.body.append(tip);
 const tabs=kind==='symbols'?Object.entries(catalog).map(([id,value])=>({id,label:value.label,count:value.items.length})):cheatTopics.map(topic=>({id:topic.id,label:topic.label,count:topic.sections.reduce((sum,section)=>sum+section.items,0)}));
 const tonePicker=kind==='symbols'?`<div class="reference-tone-control"><div class="reference-tones" role="group" aria-label="${tx('人物与手势肤色','People & gesture skin tone')}">${['✋','✋🏻','✋🏼','✋🏽','✋🏾','✋🏿'].map((glyph,index)=>`<button type="button" data-tone="${index}" aria-label="${esc([tx('默认肤色','Default tone'),tx('浅肤色','Light tone'),tx('较浅肤色','Medium-light tone'),tx('中等肤色','Medium tone'),tx('较深肤色','Medium-dark tone'),tx('深肤色','Dark tone')][index])}" aria-pressed="${index===tone}">${emojiGlyph(glyph)}</button>`).join('')}</div></div>`:'';
 root.innerHTML=`<section class="reference-page ${kind==='cheats'?'reference-sheet':''}"><header class="reference-heading"><h1>${kind==='symbols'?tx('表情符号','Symbols & Emoji'):'CheetSheet'}</h1></header><div class="reference-primary-controls"><div class="reference-tab-viewport"><div class="tabs reference-tabs" role="group" aria-label="${tx('资料分类','Reference categories')}">${tabs.map(({id,label,count})=>`<button type="button" data-tab="${id}" class="${id===active?'active':''}" aria-pressed="${id===active}" aria-label="${esc(label)}"><span>${esc(label)}</span><small data-tab-count="${id}">${formatNumber(count)}</small></button>`).join('')}</div></div><label class="reference-search">${icon('lucide:search')}<input type="search" id="reference-search" autocomplete="off" placeholder="${kind==='symbols'?tx('搜索字符、名称或代码','Search characters, names or codes'):tx('搜索命令、语法或用途','Search commands, syntax or purpose')}" aria-label="${tx('搜索资料','Search references')}"></label></div><div class="reference-workspace"><aside class="reference-nav" aria-label="${tx('分类导航','Category navigation')}">${tonePicker}<nav id="reference-categories"></nav><p class="reference-attribution" id="reference-attribution"></p></aside><div class="reference-scroll" tabindex="-1"><div id="reference-results" class="reference-results"></div></div></div></section>`;
 const input=root.querySelector<HTMLInputElement>('#reference-search')!,results=root.querySelector<HTMLElement>('#reference-results')!,scroll=root.querySelector<HTMLElement>('.reference-scroll')!,nav=root.querySelector<HTMLElement>('#reference-categories')!,attribution=root.querySelector<HTMLElement>('#reference-attribution')!,tones=root.querySelector<HTMLElement>('.reference-tones');
 const setCount=(value:number)=>{root.querySelector<HTMLElement>(`[data-tab-count="${active}"]`)!.textContent=formatNumber(value);};
 const performCopy=(value:string)=>void copyTextValue(value).then(()=>{if(!disposed)notify(tx('已复制','Copied'));}).catch(error=>{if(!disposed)notify(String(error));});
 const hideTip=()=>{clearTimeout(tooltipTimer);tooltipAnchor?.removeAttribute('aria-describedby');tooltipAnchor=undefined;if(!tip.hidden)tip.hidden=true;};
 const showTip=(button:HTMLElement)=>{
  if(disposed||!button.isConnected)return;const entry=entries[Number(button.dataset.entry)];if(!entry)return;
  hideTip();tooltipAnchor=button;tip.dataset.kind=active;button.setAttribute('aria-describedby',tip.id);
  const glyph=active==='emoji'?selectedGlyph(entry):entry.glyph;tipGlyph=glyph;
  const toneOptions=entry.tones&&entry.tones.size>1?[...entry.tones].sort(([a],[b])=>a-b):[];
  const code=active==='emoji'?Array.from(glyph,c=>'U+'+c.codePointAt(0)!.toString(16).toUpperCase()).join(' '):entry.detail;
  tip.innerHTML=`<header class="reference-popover-heading">${active!=='mime'?`<div class="reference-popover-preview">${entry.color?`<i style="background:${entry.color}"></i>`:active==='emoji'?emojiGlyph(glyph):`<span class="reference-text-preview">${esc(glyph||'␣')}</span>`}</div>`:''}<div><strong>${esc(entry.title)}</strong><small>${esc(groupLabel(entry.group))}</small></div></header><div class="reference-popover-body">${active==='mime'?`<p class="reference-mime-description">${esc(entry.detail)}</p><div class="reference-detail-label">${tx('扩展名','Extensions')}</div><div class="reference-extensions">${entry.extensions!.length?entry.extensions!.map(ext=>`<code>.${esc(ext)}</code>`).join(''):tx('无已知扩展名映射','No known extension mapping')}</div>${mimeSpecifications(entry)}`:code?`<code class="reference-code">${esc(code)}</code>`:''}${toneOptions.length?`<div class="reference-detail-label">${tx('肤色变体','Skin tones')}</div><div class="reference-detail-tones">${toneOptions.map(([index,value])=>`<button type="button" data-detail-tone="${index}" aria-label="${esc(value)}" aria-pressed="${value===glyph}">${emojiGlyph(value)}</button>`).join('')}</div>`:''}${(entry.variants?.length||0)>6?`<details class="reference-mixed-tones"><summary>${tx('更多肤色组合','More tone combinations')}</summary><div class="reference-variants">${entry.variants!.map((variant,index)=>`<button type="button" data-variant="${index}" aria-label="${esc(variant)}" aria-pressed="${variant===glyph}">${emojiGlyph(variant)}</button>`).join('')}</div></details>`:''}</div><footer class="reference-popover-actions"><button type="button" class="primary" data-tip-copy="main">${icon('lucide:copy')}${active==='entities'?tx('复制实体','Copy entity'):tx('复制','Copy')}</button>${entry.secondary?`<button type="button" data-tip-copy="secondary">${active==='entities'?tx('复制字符','Copy character'):tx('复制名称','Copy name')}</button>`:''}</footer>`;
  tip.hidden=false;positionTip();
 };
 const positionTip=()=>{if(!tooltipAnchor||tip.hidden)return;tip.style.maxWidth=Math.max(0,innerWidth-16)+'px';const rect=tooltipAnchor.getBoundingClientRect(),size=tip.getBoundingClientRect(),right=Math.max(8,innerWidth-size.width-8),left=Math.min(Math.max(8,scroll.getBoundingClientRect().left),right);tip.style.left=Math.max(left,Math.min(right,rect.left+rect.width/2-size.width/2))+'px';tip.style.top=Math.max(8,Math.min(innerHeight-size.height-8,rect.bottom+8+size.height>innerHeight?rect.top-size.height-8:rect.bottom+8))+'px';};
 const tipResize=new ResizeObserver(positionTip);tipResize.observe(tip);
 const showTonePreview=(glyph:string)=>{tipGlyph=glyph;tip.querySelector<HTMLElement>('.reference-popover-preview')!.innerHTML=emojiGlyph(glyph);tip.querySelector<HTMLElement>('.reference-code')!.textContent=Array.from(glyph,c=>'U+'+c.codePointAt(0)!.toString(16).toUpperCase()).join(' ');};
 const previewVariant=(button:HTMLElement)=>{if(!tooltipAnchor)return;const entry=entries[Number(tooltipAnchor.dataset.entry)];const glyph=button.dataset.variant!==undefined?entry.variants?.[Number(button.dataset.variant)]:button.dataset.detailTone!==undefined?entry.tones?.get(Number(button.dataset.detailTone)):undefined;if(glyph)showTonePreview(glyph);};
 const restoreTonePreview=(related:EventTarget|null)=>{if(!tooltipAnchor||related instanceof Element&&related.closest('[data-detail-tone],[data-variant]'))return;showTonePreview(selectedGlyph(entries[Number(tooltipAnchor.dataset.entry)]));};
 tip.onpointerover=event=>{const button=(event.target as HTMLElement).closest<HTMLElement>('[data-detail-tone],[data-variant]');if(button)previewVariant(button);};
 tip.onpointerout=event=>{if((event.target as HTMLElement).closest('[data-detail-tone],[data-variant]'))restoreTonePreview(event.relatedTarget);};
 tip.addEventListener('focusin',event=>{const button=(event.target as HTMLElement).closest<HTMLElement>('[data-detail-tone],[data-variant]');if(button)previewVariant(button);});
 tip.addEventListener('focusout',event=>{if((event.target as HTMLElement).closest('[data-detail-tone],[data-variant]'))restoreTonePreview(event.relatedTarget);});
 tip.onclick=event=>{const button=(event.target as HTMLElement).closest<HTMLElement>('button');if(!button||!tooltipAnchor)return;const entry=entries[Number(tooltipAnchor.dataset.entry)];if(button.dataset.variant!==undefined||button.dataset.detailTone!==undefined){
  const variant=button.dataset.variant!==undefined,glyph=variant?entry.variants![Number(button.dataset.variant)]:entry.tones!.get(Number(button.dataset.detailTone))!;
  if(variant){variantOverrides.set(entry,glyph);toneOverrides.delete(entry);}else{variantOverrides.delete(entry);toneOverrides.set(entry,Number(button.dataset.detailTone));}
  showTonePreview(glyph);
  for(const node of tip.querySelectorAll<HTMLElement>('[data-detail-tone],[data-variant]'))node.setAttribute('aria-pressed',String(node.querySelector<HTMLElement>('.reference-emoji-glyph')?.dataset.emoji===glyph));
  const tile=tooltipAnchor.querySelector<HTMLElement>('.reference-emoji-glyph');if(tile){tile.dataset.emoji=glyph;tile.textContent=glyph;}
  performCopy(glyph);
 }else performCopy(button.dataset.tipCopy==='secondary'?entry.secondary!:active==='emoji'?selectedGlyph(entry):entry.copy);};
 tip.onpointerenter=()=>clearTimeout(tooltipTimer);tip.onpointerleave=()=>{tooltipTimer=setTimeout(()=>{if(!tip.contains(document.activeElement))hideTip();},140);};
 const scheduleTip=(button:HTMLElement)=>{clearTimeout(tooltipTimer);tooltipTimer=setTimeout(()=>showTip(button),180);};
 results.onpointerover=event=>{if(awaitPointer)return;const button=(event.target as HTMLElement).closest<HTMLElement>('[data-entry]');if(button&&button!==tooltipAnchor)scheduleTip(button);};
 results.onpointermove=event=>{awaitPointer=false;pointer={x:event.clientX,y:event.clientY};const button=(event.target as HTMLElement).closest<HTMLElement>('[data-entry]');if(button&&tip.hidden)scheduleTip(button);};
 results.onpointerout=event=>{const button=(event.target as HTMLElement).closest('[data-entry]');if(button&&!button.contains(event.relatedTarget as Node)){clearTimeout(tooltipTimer);tooltipTimer=setTimeout(()=>{if(!tip.matches(':hover')&&!tip.contains(document.activeElement))hideTip();},140);}};
 results.addEventListener('focusin',event=>{const button=(event.target as HTMLElement).closest<HTMLElement>('[data-entry]');if(button){focusIndex=Number(button.dataset.entry);if(button.matches(':focus-visible'))showTip(button);}});
 const dismiss=(event:Event)=>{if(event instanceof KeyboardEvent&&event.key!=='Escape')return;if(event instanceof PointerEvent&&(tip.contains(event.target as Node)||tooltipAnchor?.contains(event.target as Node)))return;hideTip();};
 document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',dismiss);
 const updateCategory=(group:string)=>{
  // Keep an explicit selection stable while the document passes intermediate lazy sections.
  group=navigationGroup||group;if(group===currentCategory)return;currentCategory=group;
  for(const button of nav.querySelectorAll<HTMLElement>('[data-category]')){const selected=button.dataset.category===group;button.classList.toggle('active',selected);if(selected)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current');}
  const chosen=nav.querySelector<HTMLElement>('[aria-current]');if(chosen){const rect=chosen.getBoundingClientRect(),viewport=nav.getBoundingClientRect();if(rect.top<viewport.top)nav.scrollTop+=rect.top-viewport.top;else if(rect.bottom>viewport.bottom)nav.scrollTop+=rect.bottom-viewport.bottom;}
 };
 const renderWindow=()=>{
  frame=0;if(disposed)return;
  if(kind==='symbols'){
   const min=scroll.scrollTop-180,max=scroll.scrollTop+scroll.clientHeight+180,wanted=new Set<number>();
   // Binary search bounds; scrolling never scans the whole catalog.
   let left=0,right=rows.length;while(left<right){const mid=(left+right)>>>1;if(rows[mid].top+rows[mid].height<min)left=mid+1;else right=mid;}
   const batch=document.createDocumentFragment();
   for(let index=left;index<rows.length&&rows[index].top<max;index++){
    wanted.add(index);if(mounted.has(index))continue;const row=rows[index],node=document.createElement('div');node.className=row.title?'reference-section-heading':'reference-virtual-row';node.style.top=row.top+'px';node.style.height=row.height+'px';
    node.innerHTML=row.title?`<h2>${esc(row.title)}</h2><small>${formatNumber(sections.find(section=>section.group===row.group)!.count)}</small>`:row.items!.map(({entry,index})=>`<button type="button" class="reference-item reference-main" data-entry="${index}" tabindex="${index===focusIndex?0:-1}" aria-label="${esc(entry.title)}">${entry.color?`<i class="reference-swatch" style="background:${entry.color}"></i>`:active==='emoji'?emojiGlyph(selectedGlyph(entry)):`<span class="reference-glyph">${esc(entry.glyph||'␣')}</span>`}</button>`).join('');
    batch.append(node);mounted.set(index,node);
   }
   if(batch.childNodes.length)results.append(batch);
   for(const [index,node]of mounted)if(!wanted.has(index)&&!node.contains(document.activeElement)){node.remove();mounted.delete(index);}
   const section=[...sections].reverse().find(section=>section.top<=scroll.scrollTop+48)||sections[0];if(section)updateCategory(section.group);
  }else{
   if(navigationGroup&&!navigationFrame){const target=results.querySelector<HTMLElement>(`[data-section="${navigationGroup}"]`);if(target){const box=target.getBoundingClientRect(),view=scroll.getBoundingClientRect();if(box.bottom<view.top||box.top>view.bottom)navigationGroup=undefined;}}
   const headers=Array.from(results.querySelectorAll<HTMLElement>('[data-section]'));const header=[...headers].reverse().find(node=>node.offsetTop-results.offsetTop<=scroll.scrollTop+72)||headers[0];if(header)updateCategory(header.dataset.section!);
  }
 };
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(renderWindow);};
 scroll.onscroll=()=>{hideTip();schedule();clearTimeout(scrollTipTimer);scrollTipTimer=setTimeout(()=>{if(!pointer)return;const target=document.elementFromPoint(pointer.x,pointer.y)?.closest<HTMLElement>('[data-entry]');if(target&&results.contains(target))scheduleTip(target);},140);};
 const rebuild=()=>{
  cancelNavigation();
  hideTip();awaitPointer=true;pointer=undefined;clearTimeout(scrollTipTimer);cheatDocument?.dispose();cheatDocument=undefined;currentCategory='';mounted.clear();results.replaceChildren();rows=[];sections=[];
  const term=input.value.trim().toLocaleLowerCase();
  for(const tab of tabs)if(tab.id!==active){const badge=root.querySelector<HTMLElement>(`[data-tab-count="${tab.id}"]`)!,value=formatNumber(tab.count);if(badge.textContent!==value)badge.textContent=value;}
  if(kind==='symbols'){
   tones!.parentElement!.hidden=active!=='emoji';
   entries=catalog[active].items.filter(entry=>!term||`${entry.glyph} ${(entry.variants||[]).join(' ')} ${entry.title} ${entry.detail} ${entry.group} ${groupLabel(entry.group)} ${entry.secondary||''} ${(entry.extensions||[]).join(' ')} ${(entry.specifications||[]).flat().join(' ')}`.toLocaleLowerCase().includes(term));
   focusIndex=Math.min(focusIndex,Math.max(0,entries.length-1));
   const buckets=new Map<string,Entry[]>();for(const entry of entries){if(!buckets.has(entry.group))buckets.set(entry.group,[]);buckets.get(entry.group)!.push(entry);}
   entries=[...buckets.values()].flat();setCount(entries.length);
   const scale=parseFloat(getComputedStyle(root).getPropertyValue('--text-scale'))||1;
   const cell=active==='mime'?Math.max(220,240*scale):active==='kaomoji'?160*scale:active==='colors'?52*scale:active==='emoji'&&scroll.clientWidth<240?52*scale:56*scale;
   const scrollStyle=getComputedStyle(scroll),available=scroll.clientWidth-parseFloat(scrollStyle.paddingLeft)-parseFloat(scrollStyle.paddingRight);
   columns=Math.max(1,Math.floor((available+6)/(cell+6)));const height=(active==='mime'?48:active==='kaomoji'?54:60)*Math.max(1,scale),headerHeight=48*Math.max(1,scale);
   results.className='reference-results reference-virtual reference-kind-'+active;results.style.setProperty('--reference-columns',String(columns));
   let top=0,index=0;for(const [group,items]of buckets){sections.push({group,top,count:items.length});rows.push({top,height:headerHeight,group,title:groupLabel(group)});top+=headerHeight;
    for(let at=0;at<items.length;at+=columns){const batch=items.slice(at,at+columns).map(entry=>({entry,index:index++}));rows.push({top,height,group,items:batch});top+=height;}top+=20;
   }
   results.style.height=top+'px';nav.innerHTML=sections.map(section=>`<button type="button" data-category="${esc(section.group)}"><span>${esc(groupLabel(section.group))}</span><small>${formatNumber(section.count)}</small></button>`).join('');
   attribution.innerHTML=catalog[active].source?`<a href="${catalog[active].source}">${tx('来源与文档','Source & docs')} ↗</a>`:'';
  }else{
   const topic=cheatTopics.find(topic=>topic.id===active)!;
   const filtered=filterCheatSections(topic,term);
   const total=filtered.reduce((sum,section)=>sum+section.items,0);setCount(total);
   cheatDocument=mountCheatDocument(results,scroll,topic,filtered);
   nav.innerHTML=filtered.map(section=>`<button type="button" data-category="${section.id}"><span>${esc(section.name)}</span><small>${section.items||''}</small></button>`).join('');
   entries=filtered.map(section=>({glyph:'',title:section.name,detail:'',group:section.id,copy:''}));attribution.innerHTML=`<a href="${topic.source}">Quick Reference · MIT ↗</a>`;

  }
  if(!entries.length)results.innerHTML+=`<div class="reference-empty">${tx('没有匹配的内容','No matching items')}</div>`;
  renderWindow();
 };
 nav.onclick=event=>{const button=(event.target as HTMLElement).closest<HTMLElement>('[data-category]');if(!button)return;awaitPointer=true;pointer=undefined;clearTimeout(scrollTipTimer);const group=button.dataset.category!;cheatDocument?.ensure(group);const top=kind==='symbols'?sections.find(section=>section.group===group)!.top:Array.from(results.querySelectorAll<HTMLElement>('[data-section]')).find(node=>node.dataset.section===group)!.offsetTop-results.offsetTop;
  hideTip();cancelNavigation();navigationGroup=group;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(kind==='symbols'){
   scroll.scrollTo({top,behavior:reduced?'instant':'smooth'});
   if(reduced||Math.abs(scroll.scrollTop-top)<1){navigationGroup=undefined;schedule();}
  }
  else{
   // Lazy sections change height while scrolling. Follow the actual heading throughout the motion.
   const start=scroll.scrollTop,began=performance.now(),duration=reduced?0:360;
   const move=(now:number)=>{if(disposed)return;const target=results.querySelector<HTMLElement>(`[data-section="${group}"]`);if(!target)return;
    const destination=Math.max(0,Math.min(scroll.scrollHeight-scroll.clientHeight,target.offsetTop-results.offsetTop));
    const progress=duration?Math.min(1,(now-began)/duration):1,ease=1-(1-progress)**3;
    scroll.scrollTop=start+(destination-start)*ease;updateCategory(group);
    if(now-began<duration+200)navigationFrame=requestAnimationFrame(move);else{navigationFrame=0;schedule();}
   };navigationFrame=requestAnimationFrame(move);
  }
  updateCategory(group);
 };
 scroll.addEventListener('wheel',cancelNavigation,{passive:true});scroll.addEventListener('touchstart',cancelNavigation,{passive:true});scroll.addEventListener('pointerdown',cancelNavigation);
 const finishSymbolNavigation=()=>{if(kind==='symbols'&&navigationGroup){navigationGroup=undefined;schedule();}};
 scroll.addEventListener('scrollend',finishSymbolNavigation);
 const navigationKey=(event:KeyboardEvent)=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))cancelNavigation();};
 scroll.addEventListener('keydown',navigationKey);
 root.onclick=event=>{const link=(event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');if(!link)return;event.preventDefault();if(link.getAttribute('href')?.startsWith('#')){const anchor=decodeURIComponent(link.hash.slice(1)).toLocaleLowerCase();const topic=cheatTopics.find(topic=>topic.id===active);const section=topic?.sections.find(section=>anchorKey(section.name)===anchor||anchorKey(section.group)===anchor);if(section){if(input.value){input.value='';scroll.scrollTo({top:0,behavior:'instant'});rebuild();}nav.querySelector<HTMLButtonElement>(`[data-category="${section.id}"]`)?.click();}return;}void window.clipper.openReference(link.href).catch(error=>notify(String(error)));};
 results.onclick=event=>{const code=(event.target as HTMLElement).closest<HTMLElement>('[data-code]');if(code){performCopy(code.dataset.code!);return;}const button=(event.target as HTMLElement).closest<HTMLElement>('[data-entry],[data-copy]');if(!button)return;const entry=entries[Number(button.dataset.entry??button.dataset.copy)];performCopy(active==='emoji'&&kind==='symbols'?selectedGlyph(entry):entry.copy);};
 results.onkeydown=event=>{
  if(kind!=='symbols'||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)||event.altKey||event.ctrlKey||event.metaKey)return;
  const button=(event.target as HTMLElement).closest<HTMLElement>('[data-entry]');if(!button)return;event.preventDefault();
  const at=Number(button.dataset.entry),next=event.key==='Home'?0:event.key==='End'?entries.length-1:at+(event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:event.key==='ArrowUp'?-columns:columns);
  focusIndex=Math.max(0,Math.min(entries.length-1,next));const row=rows.find(row=>row.items?.some(item=>item.index===focusIndex))!;
  if(row.top<scroll.scrollTop||row.top+row.height>scroll.scrollTop+scroll.clientHeight)scroll.scrollTo({top:row.top,behavior:'instant'});renderWindow();
  for(const node of results.querySelectorAll<HTMLElement>('[data-entry]'))node.tabIndex=Number(node.dataset.entry)===focusIndex?0:-1;
  results.querySelector<HTMLElement>(`[data-entry="${focusIndex}"]`)?.focus({preventScroll:true});
 };
 root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button=>button.onclick=()=>{active=button.dataset.tab!;input.value='';clearTimeout(queryTimer);scroll.scrollTo({top:0,behavior:'instant'});focusIndex=0;root.querySelectorAll<HTMLElement>('[data-tab]').forEach(node=>{node.classList.toggle('active',node.dataset.tab===active);node.setAttribute('aria-pressed',String(node.dataset.tab===active));});rebuild();});
 root.querySelectorAll<HTMLButtonElement>('[data-tone]').forEach(button=>button.onclick=()=>{
  const next=Number(button.dataset.tone);tone=next;for(const entry of catalog.emoji.items){toneOverrides.delete(entry);variantOverrides.delete(entry);}
  root.querySelectorAll<HTMLElement>('[data-tone]').forEach(node=>node.setAttribute('aria-pressed',String(Number(node.dataset.tone)===tone)));hideTip();
  for(const [rowIndex,node]of mounted)if(rows[rowIndex].items){
   for(const {entry,index}of rows[rowIndex].items!){
    const span=node.querySelector<HTMLElement>(`[data-entry="${index}"] .reference-emoji-glyph`),glyph=selectedGlyph(entry);
    if(span&&span.dataset.emoji!==glyph){span.dataset.emoji=glyph;span.textContent=glyph;}
   }
  }
 });
 let composing=false;input.addEventListener('compositionstart',()=>{composing=true;clearTimeout(queryTimer);});input.addEventListener('compositionend',()=>{composing=false;changed();});
 const changed=()=>{clearTimeout(queryTimer);if(!composing)queryTimer=setTimeout(()=>{scroll.scrollTo({top:0,behavior:'instant'});focusIndex=0;rebuild();},100);};input.oninput=changed;
 const readScale=()=>parseFloat(getComputedStyle(root).getPropertyValue('--text-scale'))||1;
 let width=Math.round(scroll.clientWidth),textScale=readScale(),resizeTimer:ReturnType<typeof setTimeout>|undefined;
 const relayout=()=>{if(disposed)return;const nextWidth=Math.round(scroll.clientWidth),nextScale=readScale();if(kind==='symbols'&&(width!==nextWidth||textScale!==nextScale)){const ratio=nextScale/textScale;width=nextWidth;textScale=nextScale;clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{const selected=currentCategory,section=sections.find(section=>section.group===selected),relative=section?(scroll.scrollTop-section.top)*ratio:0;rebuild();const anchor=sections.find(section=>section.group===selected);if(anchor){scroll.scrollTo({top:anchor.top+relative,behavior:'instant'});schedule();}},100);}else schedule();};
 const resize=new ResizeObserver(relayout);resize.observe(scroll);
 const appearance=new MutationObserver(relayout);appearance.observe(document.documentElement,{attributes:true,attributeFilter:['style']});

 const disposeEmojiFont=kind==='symbols'?mountEmojiFont(root,tip):()=>{};
 const disposeSegments=referenceSegments(root.querySelector<HTMLElement>('.reference-tabs')!);
 rebuild();
 return ()=>{disposed=true;disposeEmojiFont();disposeSegments();cancelNavigation();scroll.removeEventListener('wheel',cancelNavigation);scroll.removeEventListener('touchstart',cancelNavigation);scroll.removeEventListener('pointerdown',cancelNavigation);scroll.removeEventListener('scrollend',finishSymbolNavigation);scroll.removeEventListener('keydown',navigationKey);clearTimeout(queryTimer);clearTimeout(tooltipTimer);clearTimeout(scrollTipTimer);clearTimeout(resizeTimer);cancelAnimationFrame(frame);resize.disconnect();appearance.disconnect();tipResize.disconnect();cheatDocument?.dispose();hideTip();tip.remove();document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',dismiss);mounted.clear();window.clipperAppearance?.releaseFontResources?.();};
}
