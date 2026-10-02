import {appIdentity,hydrateAppIcons} from './source-apps';
import {t as tr} from '../shared/i18n';
import {icon} from './ui';
import {enabledOption,focusOption,revealOption} from './option-list';
let closeActive: (() => void) | null = null;
let activeAnchor:HTMLElement|null=null;
const disposers=new Map<HTMLElement,()=>void>();
export function onRemoval(node:HTMLElement,dispose:()=>void){disposers.set(node,dispose);}

/** Replace native selection controls with a keyboard-accessible popup. */
export function customControls(root: HTMLElement) {
  for (const select of root.querySelectorAll<HTMLSelectElement>('select')) {
    if(select.dataset.customControl)continue;select.dataset.customControl='true';
    let options = [...select.options].map(option => ({ label: option.text, value: option.value, disabled: option.disabled,source:option.dataset.sourceApp }));
    const button = document.createElement('button'); button.type = 'button'; button.className = 'custom-select'; button.id = (select.id||'select-'+crypto.randomUUID())+'-trigger';
    button.setAttribute('role','combobox'); button.setAttribute('aria-haspopup','listbox'); button.setAttribute('aria-expanded','false');
    button.setAttribute('aria-label', select.getAttribute('aria-label') || select.closest('label')?.textContent?.trim() || tr('选择'));
    const label = document.createElement('span');button.append(label);button.insertAdjacentHTML('beforeend',icon('chevron-down')); 
    let value = select.value; let menu: HTMLDivElement | null = null; let modal:HTMLDialogElement|null=null;let active = 0; let prefix = ''; let typedAt = 0;let menuWidth=0;
    let focused:HTMLElement|null=null,selected:HTMLElement|null=null;
    Object.defineProperty(button,'value',{ get:()=>select.value, set:(next:string)=>{select.value=next;sync();} });
    const sync=()=>{
      const next=[...select.options].map(option=>({label:option.text,value:option.value,disabled:option.disabled,source:option.dataset.sourceApp}));
      if(menu&&(!button.isConnected||select.disabled||select.hidden||JSON.stringify(next)!==JSON.stringify(options)))close();
      options=next;value=select.value;label.textContent=select.selectedOptions[0]?.text||tr('没有可选项');button.disabled=select.disabled;wrapper.hidden=select.hidden;
      if(menu){const node=menu.children[select.selectedIndex] as HTMLElement|undefined;if(selected!==node){selected?.setAttribute('aria-selected','false');node?.setAttribute('aria-selected','true');selected=node||null;}}
    };
    const wrapper=document.createElement('span');wrapper.className='custom-select-wrap';select.before(wrapper);wrapper.append(select,button);select.classList.add('select-backing');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
    for(const prop of ['value','selectedIndex'] as const){const descriptor=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,prop)!;Object.defineProperty(select,prop,{configurable:true,get(){return descriptor.get!.call(select);},set(next){descriptor.set!.call(select,next);sync();}});}
    select.addEventListener('change',sync);const optionObserver=new MutationObserver(sync);optionObserver.observe(select,{subtree:true,childList:true,attributes:true,characterData:true});onRemoval(wrapper,()=>{optionObserver.disconnect();close();});sync();
    const updateOptions=(event:Event)=>{close();const next=(event as CustomEvent<{label:string;value:string;disabled?:boolean}[]>).detail,current=select.value;select.replaceChildren(...next.map(option=>{const node=new Option(option.label,option.value);node.disabled=!!option.disabled;return node;}));select.value=next.some(option=>option.value===current)?current:next[0]?.value||'';sync();};
    button.addEventListener('one:options',updateOptions);select.addEventListener('one:options',updateOptions);
    const close = () => { menu?.remove(); menu=null;menuWidth=0;focused=selected=null;modal?.removeEventListener('close',close);modal=null; button.setAttribute('aria-expanded','false'); button.removeAttribute('aria-controls'); button.removeAttribute('aria-activedescendant'); document.removeEventListener('pointerdown',outside,true); window.removeEventListener('resize',close); document.removeEventListener('scroll',position,true); if(closeActive===close){closeActive=null;activeAnchor=null;} };
    const outside = (event: PointerEvent) => { if(event.target!==button && !button.contains(event.target as Node) && !menu?.contains(event.target as Node))close(); };
    const activate = (index: number) => {
      active=index;const option=index>=0&&!options[index]?.disabled?menu?.children[index] as HTMLElement|undefined:undefined;
      if(focused===option)return;focused=focusOption(focused,option||null);
      if(option){button.setAttribute('aria-activedescendant',option.id);if(menu)revealOption(menu,option);}
      else button.removeAttribute('aria-activedescendant');
    };
    const move = (index:number,direction:1|-1) => {const next=enabledOption(options,index,direction);if(next>=0)activate(next);};
    const choose = (index: number) => { if(!options[index]||options[index].disabled)return; select.value=options[index].value;sync(); close(); button.focus(); select.dispatchEvent(new Event('change',{bubbles:true})); };
    const position = () => {
      if(!menu)return;const rect=button.getBoundingClientRect();
      if(!menuWidth){menu.style.width='max-content';menu.style.minWidth='0';menu.style.maxWidth='calc(100vw - 16px)';menu.style.boxSizing='border-box';menuWidth=Math.min(window.innerWidth-16,Math.max(rect.width,menu.classList.contains('source-select-popup')?220:120,menu.getBoundingClientRect().width));menu.style.width=menuWidth+'px';menu.style.maxHeight=Math.min(272,window.innerHeight-16)+'px';}
      const height=menu.getBoundingClientRect().height;
      menu.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-menuWidth-8))+'px';menu.style.top=(rect.bottom+height+5>window.innerHeight?Math.max(8,rect.top-height-5):rect.bottom+5)+'px';
    };
    const open = () => {if(menu)return;sync();if(button.disabled)return; closeActive?.(); closeActive=close;activeAnchor=button; menu=document.createElement('div'); menu.className='select-popup'; menu.setAttribute('role','listbox'); menu.id=button.id+'-options'; button.setAttribute('aria-controls',menu.id); button.setAttribute('aria-expanded','true');
      options.forEach((option,index)=>{const node=document.createElement('div');node.setAttribute('role','option');node.setAttribute('aria-label',option.label);node.id=menu!.id+'-'+index;if(option.source){menu!.classList.add('source-select-popup');node.classList.add('source-option');node.innerHTML=appIdentity(option.source);const text=document.createElement('span');text.className='source-option-label';text.textContent=option.label;node.append(text);node.title=option.label;}else node.textContent=option.label;node.insertAdjacentHTML('beforeend',icon('check'));node.setAttribute('aria-disabled',String(option.disabled));node.setAttribute('aria-selected',String(option.value===value));if(option.value===value)selected=node;node.addEventListener('pointerdown',event=>event.preventDefault());node.addEventListener('pointerenter',()=>{if(!option.disabled)activate(index);});node.addEventListener('click',()=>choose(index));menu!.append(node);});
      if(!options.length){const empty=document.createElement('div');empty.className='select-empty';empty.role='status';empty.textContent=tr('没有可选项');menu.append(empty);}
      modal=button.closest('dialog');menu.popover='manual';(modal||document.body).append(menu);menu.showPopover();void hydrateAppIcons(menu);modal?.addEventListener('close',close);position();const at=options.findIndex(option=>option.value===value),next=enabledOption(options,Math.max(0,at),1);activate(next>=0?next:enabledOption(options,options.length-1,-1)); document.addEventListener('pointerdown',outside,true); window.addEventListener('resize',close); document.addEventListener('scroll',position,true);
    };
    button.addEventListener('click',()=>{if(menu)close();else open()});
    button.addEventListener('keydown',event=>{
      event.stopPropagation();if(event.isComposing)return;
      if(event.key==='Escape'){event.preventDefault();close();return} if(event.key==='Tab'){close();return}
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();if(!menu){open();return}if(event.key==='Home')move(0,1);else if(event.key==='End')move(options.length-1,-1);else{const direction=event.key==='ArrowDown'?1:-1;move(active<0?direction>0?0:options.length-1:active+direction,direction);}return}
      if((event.key==='Enter'||event.key===' ')&&menu){event.preventDefault();choose(active);return}
      if(event.key.length===1&&!event.ctrlKey&&!event.altKey){event.preventDefault();if(Date.now()-typedAt>700)prefix='';prefix+=event.key.toLowerCase();typedAt=Date.now();open();const index=options.findIndex(option=>!option.disabled&&option.label.toLowerCase().startsWith(prefix));if(index>=0)activate(index)}
    });
    select.labels?.forEach(label=>label.addEventListener('click',event=>{if(event.target instanceof Element&&!event.target.closest('button,input,textarea,select')){event.preventDefault();button.focus();}}));
  }
  for (const input of root.querySelectorAll<HTMLInputElement>('input[type=number]')) {
    if(input.closest('.number-control'))continue;const wrapper=document.createElement('span');wrapper.className='number-control';input.replaceWith(wrapper);wrapper.append(input);
    for (const [text,direction] of [['−',-1],['+',1]] as const) { const button=document.createElement('button');button.type='button';button.innerHTML=icon(direction<0?'minus':'plus');button.setAttribute('aria-label',tr(direction<0?'减少':'增加')+(input.getAttribute('aria-label')||input.closest('label')?.textContent?.trim()||tr('数值')));button.addEventListener('click',()=>{if(input.disabled)return;const number=Number(input.value)+(Number(input.step)||1)*direction;input.value=String(Math.max(input.min?Number(input.min):-Infinity,Math.min(input.max?Number(input.max):Infinity,number)));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});wrapper.append(button); }
  }
}
export function closeControls() { closeActive?.(); }
export function updateSelectOptions(control:HTMLElement,options:{label:string;value:string;disabled?:boolean}[]){control.dispatchEvent(new CustomEvent('one:options',{detail:options}));}
export function openControl(close: () => void,anchor?:HTMLElement) { closeActive?.(); closeActive = close;activeAnchor=anchor||null; }
export function releaseControl(close: () => void) { if (closeActive === close){closeActive = null;activeAnchor=null;} }


export function setupControls(){customControls(document.body);const observer=new MutationObserver(records=>{if(activeAnchor&&!activeAnchor.isConnected)closeControls();if(records.some(record=>record.removedNodes.length))for(const [node,dispose]of disposers)if(!node.isConnected){dispose();disposers.delete(node);}for(const record of records)for(const node of record.addedNodes)if(node instanceof HTMLElement){if(node.matches('select,input[type=number]'))customControls(node.parentElement!);else if(node.querySelector('select,input[type=number]'))customControls(node);}});observer.observe(document.body,{childList:true,subtree:true});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&closeActive){e.preventDefault();e.stopImmediatePropagation();const trigger=document.querySelector<HTMLButtonElement>('button[role=combobox][aria-expanded=true]');closeControls();trigger?.focus();}},true);}
