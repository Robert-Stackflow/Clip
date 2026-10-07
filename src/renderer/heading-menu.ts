import {openAnchoredPopover,closeAnchoredPopover} from './anchored-popover';
import {onRemoval} from './controls';

/** Collection actions share One's popup motion, positioning and keyboard behavior. */
export function bindHeadingMenu(root:HTMLElement,selectors={anchor:'#collection-more-toggle',panel:'#collection-more-menu'}){
 const anchor=root.querySelector<HTMLButtonElement>(selectors.anchor),panel=root.querySelector<HTMLElement>(selectors.panel);
 if(!anchor||!panel)return;
 let open=false;
 const items=()=>Array.from(panel.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)'));
 const close=(focus=false)=>{open=false;anchor.setAttribute('aria-expanded','false');panel.setAttribute('aria-hidden','true');panel.style.pointerEvents='none';closeAnchoredPopover(panel);document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',keyboard,true);if(focus&&anchor.isConnected)anchor.focus({preventScroll:true});};
 const outside=(event:PointerEvent)=>{if(!panel.contains(event.target as Node)&&!anchor.contains(event.target as Node))close();};
 const keyboard=(event:KeyboardEvent)=>{
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close(true);return;}
  if(event.key==='Tab'){close();return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();event.stopImmediatePropagation();const buttons=items(),index=buttons.indexOf(document.activeElement as HTMLButtonElement),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:index<0?(event.key==='ArrowUp'?buttons.length-1:0):(index+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length;buttons[next]?.focus({preventScroll:true});
 };
 const show=(focus=false)=>{open=true;panel.hidden=false;panel.style.pointerEvents='';panel.setAttribute('aria-hidden','false');anchor.setAttribute('aria-expanded','true');openAnchoredPopover(panel,anchor,208,360);document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',keyboard,true);if(focus)items()[0]?.focus({preventScroll:true});};
 anchor.setAttribute('aria-controls',panel.id);anchor.setAttribute('aria-haspopup','menu');anchor.setAttribute('aria-expanded','false');
 anchor.onclick=()=>open?close():show();anchor.onkeydown=event=>{if(!open&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();show(true);if(event.key==='ArrowUp')items().at(-1)?.focus();}};
 panel.addEventListener('click',event=>{if((event.target as Element).closest('[role=menuitem]'))close();});
 panel.addEventListener('focusout',()=>{queueMicrotask(()=>{if(open&&!panel.contains(document.activeElement)&&document.activeElement!==anchor)close();});});
 onRemoval(panel,()=>close());
}
