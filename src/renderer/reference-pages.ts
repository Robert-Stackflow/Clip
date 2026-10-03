import {referenceCatalog,groupLabel,toneGlyph,tx,type Entry} from './reference-catalog';
import {cheatTopics} from './cheatsheet-data';
import {filterCheatSections,mountCheatDocument} from './cheatsheet-renderer';
import {formatNumber,setInterfaceLanguage} from '../shared/i18n';
import {icon,registerIcons} from './ui';
import {Copy,Search} from 'lucide';
import {EmojiRasterizer} from './reference-emoji';
registerIcons({copy:Copy,search:Search});
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const emojiImage=(glyph:string)=>`<canvas class="reference-emoji-image" width="96" height="96" data-emoji="${esc(glyph)}" aria-hidden="true"></canvas>`;
const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);}catch{const field=document.createElement('textarea');field.value=value;field.style.position='fixed';field.style.opacity='0';document.body.append(field);try{field.select();if(!document.execCommand('copy'))throw new Error('Clipboard unavailable');}finally{field.remove();}}};

type Row={top:number;height:number;group:string;title?:string;items?:{entry:Entry;index:number}[]};
type Section={group:string;top:number;count:number};

/** A bounded row window over one continuous catalog, including off-screen category anchors. */
export function mountReference(root:HTMLElement,kind:'symbols'|'cheats',notify:(text:string)=>void){
 setInterfaceLanguage(document.documentElement.lang==='en'?'en':'zh-CN');
 const catalog=referenceCatalog();let active=kind==='symbols'?'emoji':'git',tone=0,disposed=false;
 let rows:Row[]=[],sections:Section[]=[],entries:Entry[]=[],columns=1,frame=0,queryTimer:ReturnType<typeof setTimeout>|undefined;
 let tooltipTimer:ReturnType<typeof setTimeout>|undefined,scrollTipTimer:ReturnType<typeof setTimeout>|undefined,tooltipAnchor:HTMLElement|undefined,currentCategory='',focusIndex=0,pointer:{x:number;y:number}|undefined,tipGlyph='',awaitPointer=false;
 let cheatDocument:ReturnType<typeof mountCheatDocument>|undefined;
 let navigationFrame=0;
 const cancelNavigation=()=>{cancelAnimationFrame(navigationFrame);navigationFrame=0;};
 const mounted=new Map<number,HTMLElement>();
 const painter=kind==='symbols'?new EmojiRasterizer():undefined;
 const tip=document.createElement('div');tip.className='reference-popover';tip.hidden=true;tip.id='reference-hover-details';tip.setAttribute('role','dialog');tip.setAttribute('aria-label',tx('符号详情','Symbol details'));document.body.append(tip);
 const tabs=kind==='symbols'?Object.entries(catalog).map(([id,value])=>[id,value.label]):cheatTopics.map(topic=>[topic.id,topic.label]);
 root.innerHTML=`<section class="reference-page ${kind==='cheats'?'reference-sheet':''}"><header class="reference-heading"><h1>${kind==='symbols'?tx('表情符号','Symbols & Emoji'):'CheetSheet'}</h1><div class="reference-tab-viewport"><div class="tabs reference-tabs" aria-label="${tx('资料分类','Reference categories')}">${tabs.map(([id,label])=>`<button type="button" data-tab="${id}" class="${id===active?'active':''}">${esc(label)}</button>`).join('')}</div></div></header><div class="reference-toolbar"><label class="reference-search">${icon('lucide:search')}<input type="search" id="reference-search" autocomplete="off" placeholder="${kind==='symbols'?tx('搜索字符、名称或代码','Search characters, names or codes'):tx('搜索命令、语法或用途','Search commands, syntax or purpose')}" aria-label="${tx('搜索资料','Search references')}"></label>${kind==='symbols'?`<div class="reference-tones" aria-label="${tx('肤色','Skin tone')}">${['✋','✋🏻','✋🏼','✋🏽','✋🏾','✋🏿'].map((glyph,index)=>`<button type="button" data-tone="${index}" aria-label="${esc([tx('默认肤色','Default tone'),tx('浅肤色','Light tone'),tx('较浅肤色','Medium-light tone'),tx('中等肤色','Medium tone'),tx('较深肤色','Medium-dark tone'),tx('深肤色','Dark tone')][index])}" aria-pressed="${index===tone}">${emojiImage(glyph)}</button>`).join('')}</div>`:''}<span id="reference-count" class="reference-count"></span></div><div class="reference-workspace"><aside class="reference-nav" aria-label="${tx('分类导航','Category navigation')}">${kind==='cheats'?`<div class="reference-nav-caption">${tx('本页目录','On this page')}</div>`:''}<nav id="reference-categories"></nav><p class="reference-attribution" id="reference-attribution"></p></aside><div class="reference-scroll" tabindex="-1"><div id="reference-results" class="reference-results"></div></div></div></section>`;
 const input=root.querySelector<HTMLInputElement>('#reference-search')!,results=root.querySelector<HTMLElement>('#reference-results')!,scroll=root.querySelector<HTMLElement>('.reference-scroll')!,nav=root.querySelector<HTMLElement>('#reference-categories')!,count=root.querySelector<HTMLElement>('#reference-count')!,attribution=root.querySelector<HTMLElement>('#reference-attribution')!,tones=root.querySelector<HTMLElement>('.reference-tones');
 const performCopy=(value:string)=>void copy(value).then(()=>{if(!disposed)notify(tx('已复制','Copied'));}).catch(error=>{if(!disposed)notify(String(error));});
 const hideTip=()=>{painter?.detach(tip);clearTimeout(tooltipTimer);tooltipAnchor?.removeAttribute('aria-describedby');tooltipAnchor=undefined;if(!tip.hidden)tip.hidden=true;};
 const showTip=(button:HTMLElement)=>{
  if(disposed||!button.isConnected)return;const entry=entries[Number(button.dataset.entry)];if(!entry)return;
  hideTip();tooltipAnchor=button;tip.dataset.kind=active;button.setAttribute('aria-describedby',tip.id);
  const glyph=active==='emoji'?toneGlyph(entry,tone):entry.glyph;tipGlyph=glyph;
  const toneOptions=entry.tones&&entry.tones.size>1?[...entry.tones].sort(([a],[b])=>a-b):[];
  const code=active==='emoji'?Array.from(glyph,c=>'U+'+c.codePointAt(0)!.toString(16).toUpperCase()).join(' '):entry.detail;
  tip.innerHTML=`<header class="reference-popover-heading">${active!=='mime'?`<div class="reference-popover-preview">${entry.color?`<i style="background:${entry.color}"></i>`:active==='emoji'?emojiImage(glyph):`<span class="reference-text-preview">${esc(glyph||'␣')}</span>`}</div>`:''}<div><strong>${esc(entry.title)}</strong><small>${esc(groupLabel(entry.group))}</small></div></header><div class="reference-popover-body">${active==='mime'?`<p class="reference-mime-description">${esc(entry.detail)}</p><div class="reference-detail-label">${tx('扩展名','Extensions')}</div><div class="reference-extensions">${entry.extensions!.length?entry.extensions!.map(ext=>`<code>.${esc(ext)}</code>`).join(''):tx('无已知扩展名映射','No known extension mapping')}</div>`:code?`<code class="reference-code">${esc(code)}</code>`:''}${toneOptions.length?`<div class="reference-detail-label">${tx('肤色变体','Skin tones')}</div><div class="reference-detail-tones">${toneOptions.map(([index,value])=>`<button type="button" data-detail-tone="${index}" aria-label="${esc(value)}" aria-pressed="${value===glyph}">${emojiImage(value)}</button>`).join('')}</div>`:''}${(entry.variants?.length||0)>6?`<details class="reference-mixed-tones"><summary>${tx('更多肤色组合','More tone combinations')}</summary><div class="reference-variants">${entry.variants!.map((variant,index)=>`<button type="button" data-variant="${index}" aria-label="${esc(variant)}">${emojiImage(variant)}</button>`).join('')}</div></details>`:''}</div><footer class="reference-popover-actions"><button type="button" class="primary" data-tip-copy="main">${icon('lucide:copy')}${active==='entities'?tx('复制实体','Copy entity'):tx('复制','Copy')}</button>${entry.secondary?`<button type="button" data-tip-copy="secondary">${active==='entities'?tx('复制字符','Copy character'):tx('复制名称','Copy name')}</button>`:''}</footer>`;
  tip.hidden=false;painter?.attach(tip);positionTip();
 };
 const positionTip=()=>{if(!tooltipAnchor||tip.hidden)return;const left=Math.max(8,scroll.getBoundingClientRect().left);tip.style.maxWidth=Math.max(120,innerWidth-left-8)+'px';const rect=tooltipAnchor.getBoundingClientRect(),size=tip.getBoundingClientRect();tip.style.left=Math.max(left,Math.min(innerWidth-size.width-8,rect.left+rect.width/2-size.width/2))+'px';tip.style.top=Math.max(8,Math.min(innerHeight-size.height-8,rect.bottom+8+size.height>innerHeight?rect.top-size.height-8:rect.bottom+8))+'px';};
 const tipResize=new ResizeObserver(positionTip);tipResize.observe(tip);
 const previewTone=(button:HTMLElement)=>{if(!tooltipAnchor||button.dataset.detailTone===undefined)return;const entry=entries[Number(tooltipAnchor.dataset.entry)];tipGlyph=entry.tones!.get(Number(button.dataset.detailTone))!;painter?.detach(tip);tip.querySelector<HTMLElement>('.reference-popover-preview')!.innerHTML=emojiImage(tipGlyph);painter?.attach(tip);tip.querySelector<HTMLElement>('.reference-code')!.textContent=Array.from(tipGlyph,c=>'U+'+c.codePointAt(0)!.toString(16).toUpperCase()).join(' ');for(const node of tip.querySelectorAll<HTMLElement>('[data-detail-tone]'))node.setAttribute('aria-pressed',String(node===button));};
 tip.onpointerover=event=>{const button=(event.target as HTMLElement).closest<HTMLElement>('[data-detail-tone]');if(button)previewTone(button);};
 tip.addEventListener('focusin',event=>{const button=(event.target as HTMLElement).closest<HTMLElement>('[data-detail-tone]');if(button)previewTone(button);});
 tip.onclick=event=>{const button=(event.target as HTMLElement).closest<HTMLElement>('button');if(!button||!tooltipAnchor)return;const entry=entries[Number(tooltipAnchor.dataset.entry)];if(button.dataset.variant!==undefined)performCopy(entry.variants![Number(button.dataset.variant)]);else if(button.dataset.detailTone!==undefined){previewTone(button);performCopy(tipGlyph);}else performCopy(button.dataset.tipCopy==='secondary'?entry.secondary!:active==='emoji'?tipGlyph:entry.copy);};
 tip.onpointerenter=()=>clearTimeout(tooltipTimer);tip.onpointerleave=()=>{tooltipTimer=setTimeout(()=>{if(!tip.contains(document.activeElement))hideTip();},140);};
 const scheduleTip=(button:HTMLElement)=>{clearTimeout(tooltipTimer);tooltipTimer=setTimeout(()=>showTip(button),180);};
 results.onpointerover=event=>{if(awaitPointer)return;const button=(event.target as HTMLElement).closest<HTMLElement>('[data-entry]');if(button&&button!==tooltipAnchor)scheduleTip(button);};
 results.onpointermove=event=>{awaitPointer=false;pointer={x:event.clientX,y:event.clientY};const button=(event.target as HTMLElement).closest<HTMLElement>('[data-entry]');if(button&&tip.hidden)scheduleTip(button);};
 results.onpointerout=event=>{const button=(event.target as HTMLElement).closest('[data-entry]');if(button&&!button.contains(event.relatedTarget as Node)){clearTimeout(tooltipTimer);tooltipTimer=setTimeout(()=>{if(!tip.matches(':hover')&&!tip.contains(document.activeElement))hideTip();},140);}};
 results.addEventListener('focusin',event=>{const button=(event.target as HTMLElement).closest<HTMLElement>('[data-entry]');if(button){focusIndex=Number(button.dataset.entry);if(button.matches(':focus-visible'))showTip(button);}});
 const dismiss=(event:Event)=>{if(event instanceof KeyboardEvent&&event.key!=='Escape')return;if(event instanceof PointerEvent&&(tip.contains(event.target as Node)||tooltipAnchor?.contains(event.target as Node)))return;hideTip();};
 document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',dismiss);
 const updateCategory=(group:string)=>{if(group===currentCategory)return;currentCategory=group;for(const button of nav.querySelectorAll<HTMLElement>('[data-category]')){const selected=button.dataset.category===group;button.classList.toggle('active',selected);if(selected)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current');}const chosen=nav.querySelector<HTMLElement>('[aria-current]');if(chosen){const relative=chosen.offsetTop-nav.offsetTop;if(relative<nav.scrollTop)nav.scrollTop=relative;else if(relative+chosen.offsetHeight>nav.scrollTop+nav.clientHeight)nav.scrollTop=relative+chosen.offsetHeight-nav.clientHeight;}};
 const renderWindow=()=>{
  frame=0;if(disposed)return;
  if(kind==='symbols'){
   const min=scroll.scrollTop-180,max=scroll.scrollTop+scroll.clientHeight+180,wanted=new Set<number>();
   // Binary search bounds; scrolling never scans the whole catalog.
   let left=0,right=rows.length;while(left<right){const mid=(left+right)>>>1;if(rows[mid].top+rows[mid].height<min)left=mid+1;else right=mid;}
   const batch=document.createDocumentFragment();
   for(let index=left;index<rows.length&&rows[index].top<max;index++){
    wanted.add(index);if(mounted.has(index))continue;const row=rows[index],node=document.createElement('div');node.className=row.title?'reference-section-heading':'reference-virtual-row';node.style.top=row.top+'px';node.style.height=row.height+'px';
    node.innerHTML=row.title?`<h2>${esc(row.title)}</h2><small>${formatNumber(sections.find(section=>section.group===row.group)!.count)}</small>`:row.items!.map(({entry,index})=>`<button type="button" class="reference-item reference-main" data-entry="${index}" tabindex="${index===focusIndex?0:-1}" aria-label="${esc(entry.title)}">${entry.color?`<i class="reference-swatch" style="background:${entry.color}"></i>`:active==='emoji'?`<canvas class="reference-emoji-image" width="96" height="96" data-emoji="${esc(toneGlyph(entry,tone))}" aria-hidden="true"></canvas>`:`<span class="reference-glyph">${esc(entry.glyph||'␣')}</span>`}</button>`).join('');
    batch.append(node);mounted.set(index,node);
   }
   if(batch.childNodes.length)results.append(batch);
   if(active==='emoji')for(const [index,node]of mounted)if(wanted.has(index))painter!.attach(node);
   for(const [index,node]of mounted)if(!wanted.has(index)&&!node.contains(document.activeElement)){painter?.detach(node);node.remove();mounted.delete(index);}
   const section=[...sections].reverse().find(section=>section.top<=scroll.scrollTop+48)||sections[0];if(section)updateCategory(section.group);
  }else{
   const headers=Array.from(results.querySelectorAll<HTMLElement>('[data-section]'));const header=[...headers].reverse().find(node=>node.offsetTop-results.offsetTop<=scroll.scrollTop+72)||headers[0];if(header)updateCategory(header.dataset.section!);
  }
 };
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(renderWindow);};
 scroll.onscroll=()=>{hideTip();schedule();clearTimeout(scrollTipTimer);scrollTipTimer=setTimeout(()=>{if(!pointer)return;const target=document.elementFromPoint(pointer.x,pointer.y)?.closest<HTMLElement>('[data-entry]');if(target&&results.contains(target))scheduleTip(target);},140);};
 const rebuild=()=>{
  cancelNavigation();
  hideTip();awaitPointer=true;pointer=undefined;clearTimeout(scrollTipTimer);cheatDocument?.dispose();cheatDocument=undefined;currentCategory='';painter?.clear();if(tones)painter?.attach(tones);mounted.clear();results.replaceChildren();rows=[];sections=[];
  const term=input.value.trim().toLocaleLowerCase();
  if(kind==='symbols'){
   tones!.hidden=active!=='emoji';
   entries=catalog[active].items.filter(entry=>!term||`${entry.glyph} ${(entry.variants||[]).join(' ')} ${entry.title} ${entry.detail} ${entry.group} ${groupLabel(entry.group)} ${entry.secondary||''} ${(entry.extensions||[]).join(' ')}`.toLocaleLowerCase().includes(term));
   focusIndex=Math.min(focusIndex,Math.max(0,entries.length-1));
   const buckets=new Map<string,Entry[]>();for(const entry of entries){if(!buckets.has(entry.group))buckets.set(entry.group,[]);buckets.get(entry.group)!.push(entry);}
   entries=[...buckets.values()].flat();count.textContent=tx(`${formatNumber(entries.length)} 项`,`${formatNumber(entries.length)} items`);
   const scale=parseFloat(getComputedStyle(root).getPropertyValue('--text-scale'))||1;
   const cell=active==='mime'?Math.max(220,240*scale):active==='kaomoji'?160*scale:active==='colors'?52*scale:56*scale;
   columns=Math.max(1,Math.floor((scroll.clientWidth-20)/(cell+6)));const height=(active==='mime'?48:active==='kaomoji'?54:60)*Math.max(1,scale),headerHeight=48*Math.max(1,scale);
   results.className='reference-results reference-virtual reference-kind-'+active;results.style.setProperty('--reference-columns',String(columns));
   let top=0,index=0;for(const [group,items]of buckets){sections.push({group,top,count:items.length});rows.push({top,height:headerHeight,group,title:groupLabel(group)});top+=headerHeight;
    for(let at=0;at<items.length;at+=columns){const batch=items.slice(at,at+columns).map(entry=>({entry,index:index++}));rows.push({top,height,group,items:batch});top+=height;}top+=20;
   }
   results.style.height=top+'px';nav.innerHTML=sections.map(section=>`<button type="button" data-category="${esc(section.group)}"><span>${esc(groupLabel(section.group))}</span><small>${formatNumber(section.count)}</small></button>`).join('');
   attribution.innerHTML=catalog[active].source?`<a href="${catalog[active].source}">${tx('来源与文档','Source & docs')} ↗</a>`:'';
  }else{
   const topic=cheatTopics.find(topic=>topic.id===active)!;
   const filtered=filterCheatSections(topic,term);
   const total=filtered.reduce((sum,section)=>sum+section.items,0);count.textContent=tx(`${formatNumber(total)} 条 · ${filtered.length} 节`,`${formatNumber(total)} entries · ${filtered.length} sections`);
   cheatDocument=mountCheatDocument(results,scroll,topic,filtered);
   nav.innerHTML=filtered.map(section=>`<button type="button" data-category="${section.id}"><span>${esc(section.name)}</span><small>${section.items||''}</small></button>`).join('');
   entries=filtered.map(section=>({glyph:'',title:section.name,detail:'',group:section.id,copy:''}));attribution.innerHTML=`<a href="${topic.source}">Quick Reference · MIT ↗</a>`;

  }
  if(!entries.length)results.innerHTML+=`<div class="reference-empty">${tx('没有匹配的内容','No matching items')}</div>`;
  renderWindow();
 };
 nav.onclick=event=>{const button=(event.target as HTMLElement).closest<HTMLElement>('[data-category]');if(!button)return;awaitPointer=true;pointer=undefined;clearTimeout(scrollTipTimer);const group=button.dataset.category!;cheatDocument?.ensure(group);const top=kind==='symbols'?sections.find(section=>section.group===group)!.top:Array.from(results.querySelectorAll<HTMLElement>('[data-section]')).find(node=>node.dataset.section===group)!.offsetTop-results.offsetTop;
  hideTip();cancelNavigation();const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(kind==='symbols')scroll.scrollTo({top,behavior:reduced?'instant':'smooth'});
  else{
   // Lazy sections change height while scrolling. Follow the actual heading throughout the motion.
   const start=scroll.scrollTop,began=performance.now(),duration=reduced?0:360;
   const move=(now:number)=>{if(disposed)return;const target=results.querySelector<HTMLElement>(`[data-section="${group}"]`);if(!target)return;
    const destination=Math.max(0,Math.min(scroll.scrollHeight-scroll.clientHeight,target.offsetTop-results.offsetTop));
    const progress=duration?Math.min(1,(now-began)/duration):1,ease=1-(1-progress)**3;
    scroll.scrollTop=start+(destination-start)*ease;updateCategory(group);
    if(now-began<duration+200)navigationFrame=requestAnimationFrame(move);else navigationFrame=0;
   };navigationFrame=requestAnimationFrame(move);
  }
  updateCategory(group);
 };
 scroll.addEventListener('wheel',cancelNavigation,{passive:true});scroll.addEventListener('touchstart',cancelNavigation,{passive:true});scroll.addEventListener('pointerdown',cancelNavigation);
 root.onclick=event=>{const link=(event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');if(!link)return;event.preventDefault();if(link.getAttribute('href')?.startsWith('#')){const anchor=decodeURIComponent(link.hash.slice(1)).toLocaleLowerCase();const topic=cheatTopics.find(topic=>topic.id===active);const section=topic?.sections.find(section=>section.name.toLocaleLowerCase().replace(/ /g,'-')===anchor);if(section)nav.querySelector<HTMLButtonElement>(`[data-category="${section.id}"]`)?.click();return;}void window.clipper.openReference(link.href).catch(error=>notify(String(error)));};
 results.onclick=event=>{const code=(event.target as HTMLElement).closest<HTMLElement>('[data-code]');if(code){performCopy(code.dataset.code!);return;}const button=(event.target as HTMLElement).closest<HTMLElement>('[data-entry],[data-copy]');if(!button)return;const entry=entries[Number(button.dataset.entry??button.dataset.copy)];performCopy(active==='emoji'&&kind==='symbols'?toneGlyph(entry,tone):entry.copy);};
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
 root.querySelectorAll<HTMLButtonElement>('[data-tone]').forEach(button=>button.onclick=()=>{tone=Number(button.dataset.tone);root.querySelectorAll<HTMLElement>('[data-tone]').forEach(node=>node.setAttribute('aria-pressed',String(Number(node.dataset.tone)===tone)));hideTip();painter?.clear();painter?.attach(tones!);for(const [index,node]of mounted)if(rows[index].items){rows[index].items!.forEach(({entry,index})=>{const canvas=node.querySelector<HTMLCanvasElement>(`[data-entry="${index}"] canvas`);if(canvas){canvas.dataset.emoji=toneGlyph(entry,tone);canvas.classList.remove('ready');canvas.getContext('2d')!.clearRect(0,0,96,96);}else node.querySelector<HTMLElement>(`[data-entry="${index}"] .reference-glyph`)!.textContent=toneGlyph(entry,tone);});painter!.attach(node);}});
 let composing=false;input.addEventListener('compositionstart',()=>{composing=true;clearTimeout(queryTimer);});input.addEventListener('compositionend',()=>{composing=false;changed();});
 const changed=()=>{clearTimeout(queryTimer);if(!composing)queryTimer=setTimeout(()=>{scroll.scrollTo({top:0,behavior:'instant'});focusIndex=0;rebuild();},100);};input.oninput=changed;
 let width=Math.round(scroll.clientWidth),resizeTimer:ReturnType<typeof setTimeout>|undefined;
 const resize=new ResizeObserver(()=>{if(disposed)return;const next=Math.round(scroll.clientWidth);if(kind==='symbols'&&width!==next){width=next;clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{const selected=currentCategory,section=sections.find(section=>section.group===selected),relative=section?scroll.scrollTop-section.top:0;rebuild();const anchor=sections.find(section=>section.group===selected);if(anchor){scroll.scrollTo({top:anchor.top+relative,behavior:'instant'});schedule();}},100);}else schedule();});resize.observe(scroll);

 rebuild();
 return ()=>{disposed=true;cancelNavigation();scroll.removeEventListener('wheel',cancelNavigation);scroll.removeEventListener('touchstart',cancelNavigation);scroll.removeEventListener('pointerdown',cancelNavigation);clearTimeout(queryTimer);clearTimeout(tooltipTimer);clearTimeout(scrollTipTimer);clearTimeout(resizeTimer);cancelAnimationFrame(frame);resize.disconnect();tipResize.disconnect();cheatDocument?.dispose();painter?.dispose();hideTip();tip.remove();document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',dismiss);mounted.clear();};
}
