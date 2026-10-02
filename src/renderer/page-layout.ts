import {closeControls} from './controls';
import {t} from '../shared/i18n';

/** Reuses live form nodes so switching sections preserves unsaved values and focus. */
export function sectionLayout(root:HTMLElement, labels:string[], starts:HTMLElement[], storageKey:string,onSelect?:(index:number)=>void){
  const nodes=Array.from(root.children) as HTMLElement[];
  const layout=document.createElement('div');layout.className='section-layout settings-layout';
  const nav=document.createElement('nav');nav.className='section-nav settings-nav';nav.setAttribute('aria-label',t('设置分类'));
  const content=document.createElement('div');content.className='section-panels settings-panels';
  const panels=labels.map((label,i)=>{
    const panel=document.createElement('section');panel.className='section-panel';panel.id=storageKey+'-panel-'+i;
    const begin=nodes.indexOf(starts[i]),end=i+1<starts.length?nodes.indexOf(starts[i+1]):nodes.length;
    nodes.slice(Math.max(0,begin),end).forEach(node=>panel.append(node));
    if(root.closest('.settings-page')){const rows=Array.from(panel.querySelectorAll<HTMLElement>(':scope > .setting-row')).filter(row=>!row.querySelector('.theme-modes'));if(rows.length){const separate=rows.some(row=>row.querySelector('#max-items,#clear-history'));if(separate){for(const row of rows){const card=document.createElement('section');card.className='settings-card';row.before(card);card.append(row);}}else{const card=document.createElement('section');card.className='settings-card';rows[0].before(card);rows.forEach(row=>card.append(row));}}panel.querySelector('#updates')?.classList.add('settings-card','update-settings-card');}
    const button=document.createElement('button');button.type='button';button.className='quiet';button.textContent=label;button.dataset.section=String(i);button.setAttribute('aria-controls',panel.id);
    button.onclick=()=>select(i);nav.append(button);content.append(panel);return panel;
  });
  function reveal(){const button=nav.querySelector<HTMLElement>('[aria-current=page]');if(nav.getClientRects().length)button?.scrollIntoView({block:'nearest',inline:'nearest'});}
  function select(index:number){(document.activeElement as HTMLElement)?.blur();closeControls();panels.forEach((panel,i)=>panel.hidden=i!==index);Array.from(nav.children).forEach((button,i)=>{button.classList.toggle('active',i===index);if(i===index)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});sessionStorage.setItem(storageKey,String(index));content.scrollTop=0;reveal();onSelect?.(index);}
  layout.append(nav,content);root.replaceChildren(layout);
  const saved=Number(sessionStorage.getItem(storageKey)||0);select(saved>=0&&saved<panels.length?saved:0);
  const resize=new ResizeObserver(()=>{if(!layout.isConnected)resize.disconnect();else reveal();});resize.observe(nav);
  // Roving keyboard focus without changing document form controls.
  nav.onkeydown=event=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const index=Array.from(nav.children).indexOf(document.activeElement!);const next=event.key==='Home'?0:event.key==='End'?panels.length-1:Math.max(0,Math.min(panels.length-1,index+(['ArrowDown','ArrowRight'].includes(event.key)?1:-1)));(nav.children[next] as HTMLButtonElement).click();(nav.children[next] as HTMLElement).focus();};
}

export function organizeTools(labels:string[], indices:number[], key:string){
  const root=document.querySelector<HTMLElement>('.tools-scroll');if(!root)return;
  const headings=Array.from(root.querySelectorAll<HTMLElement>(':scope > .tools-section-heading'));
  sectionLayout(root,labels,indices.map(i=>headings[i]),key);
}
