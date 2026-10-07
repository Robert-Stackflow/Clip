import {closeControls} from './controls';
import {t} from '../shared/i18n';
import {createElement,type IconNode} from 'lucide';
import {organizeSettingsPanel} from './settings-layout';

/** Reuses live form nodes so switching sections preserves unsaved values and focus. */
export function sectionLayout(root:HTMLElement, labels:string[], starts:HTMLElement[], storageKey:string,options:{groups?:string[];icons?:IconNode[];onSelect?:(index:number)=>void}={}){
  const nodes=Array.from(root.children) as HTMLElement[];
  const layout=document.createElement('div');layout.className='section-layout settings-layout';
  const nav=document.createElement('nav');nav.className='section-nav settings-nav';nav.setAttribute('aria-label',t('设置分类'));
  const content=document.createElement('div');content.className='section-panels settings-panels';
  const panels=labels.map((label,i)=>{
    const panel=document.createElement('section');panel.className='section-panel';panel.id=storageKey+'-panel-'+i;
    const begin=nodes.indexOf(starts[i]),end=i+1<starts.length?nodes.indexOf(starts[i+1]):nodes.length;
    nodes.slice(Math.max(0,begin),end).forEach(node=>panel.append(node));
    if(root.closest('.settings-page')){panel.querySelector('#updates')?.classList.add('update-settings-card');organizeSettingsPanel(panel);}
    const button=document.createElement('button');button.type='button';button.className='quiet';const glyph=options.icons?.[i];if(glyph)button.append(createElement(glyph,{'class':'icon lucide','aria-hidden':'true','focusable':'false','stroke-width':1.75}));const caption=document.createElement('span');caption.className='section-nav-label';caption.textContent=label;button.append(caption);button.dataset.section=String(i);button.setAttribute('aria-controls',panel.id);
    button.onclick=()=>select(i);const group=options.groups?.[i];if(group&&(i===0||options.groups?.[i-1]!==group)){const heading=document.createElement('h2');heading.className='section-nav-group';heading.textContent=group;nav.append(heading);}nav.append(button);content.append(panel);return panel;
  });
  function reveal(){const button=nav.querySelector<HTMLElement>('[aria-current=page]');if(!button||!nav.getClientRects().length)return;
    const viewport=nav.getBoundingClientRect(),item=button.getBoundingClientRect(),margin=4;
    if(item.top<viewport.top+margin)nav.scrollTop+=item.top-viewport.top-margin;
    else if(item.bottom>viewport.bottom-margin)nav.scrollTop+=item.bottom-viewport.bottom+margin;
    if(item.left<viewport.left+margin)nav.scrollLeft+=item.left-viewport.left-margin;
    else if(item.right>viewport.right-margin)nav.scrollLeft+=item.right-viewport.right+margin;
  }
  function select(index:number){(document.activeElement as HTMLElement)?.blur();closeControls();panels.forEach((panel,i)=>panel.hidden=i!==index);Array.from(nav.querySelectorAll<HTMLButtonElement>('[data-section]')).forEach((button,i)=>{button.classList.toggle('active',i===index);if(i===index)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});sessionStorage.setItem(storageKey,String(index));content.scrollTop=0;reveal();options.onSelect?.(index);}
  layout.append(nav,content);root.replaceChildren(layout);
  const saved=Number(sessionStorage.getItem(storageKey)||0);select(saved>=0&&saved<panels.length?saved:0);
  const resize=new ResizeObserver(()=>{if(!layout.isConnected)resize.disconnect();else reveal();});resize.observe(nav);
  // Roving keyboard focus without changing document form controls.
  nav.onkeydown=event=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const buttons=Array.from(nav.querySelectorAll<HTMLButtonElement>('[data-section]')),index=buttons.indexOf(document.activeElement as HTMLButtonElement);const next=event.key==='Home'?0:event.key==='End'?panels.length-1:Math.max(0,Math.min(panels.length-1,index+(['ArrowDown','ArrowRight'].includes(event.key)?1:-1)));buttons[next].click();buttons[next].focus();};
}

export function organizeTools(labels:string[], indices:number[], key:string,icons:IconNode[]=[]){
  const root=document.querySelector<HTMLElement>('.tools-scroll');if(!root)return;
  const headings=Array.from(root.querySelectorAll<HTMLElement>(':scope > .tools-section-heading'));
  sectionLayout(root,labels,indices.map(i=>headings[i]),key,{icons});
}
