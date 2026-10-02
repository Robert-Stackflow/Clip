// Keep long diagnostics readable without forwarding navigation keys to history.
export function enableFeedbackScroll(element:HTMLElement){
  element.onkeydown=event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
    const key=event.key;
    if(!['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(key))return;
    event.preventDefault();event.stopPropagation();
    if(key==='Home')element.scrollTop=0;
    else if(key==='End')element.scrollTop=element.scrollHeight;
    else element.scrollTop+=(key==='ArrowUp'||key==='PageUp'?-1:1)*(key==='ArrowDown'||key==='ArrowUp'?40:element.clientHeight);
  };
}
export function setupInlineFeedback(element:HTMLElement){
 enableFeedbackScroll(element);const sync=()=>element.tabIndex=element.textContent?.trim()?0:-1;new MutationObserver(sync).observe(element,{childList:true,subtree:true,characterData:true});sync();element.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();element.textContent='';}});
}

/** Keep short feedback above dialogs and outside the window's scrolling layout. */
export function setupFloatingFeedback(element:HTMLElement,contentDriven=false){
  element.popover='manual';
  const sync=()=>{
    const visible=element.isConnected&&!element.hidden&&(!contentDriven||!!element.textContent?.trim());
    if(contentDriven)element.tabIndex=visible?0:-1;
    if(visible&&!element.matches(':popover-open'))element.showPopover();
    else if(!visible&&element.matches(':popover-open'))element.hidePopover();
  };
  new MutationObserver(sync).observe(element,{attributes:true,attributeFilter:['hidden'],childList:contentDriven,characterData:contentDriven,subtree:contentDriven});
  if(contentDriven){element.setAttribute('aria-live','polite');element.setAttribute('aria-atomic','true');enableFeedbackScroll(element);element.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();element.textContent='';}});}
  sync();
}

/** Pause dismissal while a notification is being read with a pointer or keyboard. */
export function transientNotice(element:HTMLElement,duration=7000){
  let timer:ReturnType<typeof setTimeout>|undefined;
  const reading=()=>element.matches(':hover,:focus-within');
  const pause=()=>clearTimeout(timer);
  const arm=()=>{pause();if(!reading())timer=setTimeout(()=>{if(!reading())element.textContent='';},duration);};
  element.addEventListener('mouseenter',pause);element.addEventListener('focusin',pause);
  element.addEventListener('mouseleave',arm);element.addEventListener('focusout',arm);
  return (value:unknown)=>{element.textContent=String(value instanceof Error?value.message:value).replace(/^Error invoking remote method '[^']+': Error: /,'');arm();};
}
