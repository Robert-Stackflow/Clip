import './feedback.css';

interface FeedbackMotion{revision:number;animation?:Animation;sync?:()=>void}
const motions=new WeakMap<HTMLElement,FeedbackMotion>();
function motionState(element:HTMLElement){let state=motions.get(element);if(!state){state={revision:0};motions.set(element,state);element.classList.add('feedback-motion');}return state;}
function animateFeedback(element:HTMLElement,phase:'enter'|'update'|'exit',finish?:()=>void){
 const state=motionState(element),revision=++state.revision,style=getComputedStyle(element),interrupted=!!state.animation;
 const opacity=interrupted?style.opacity:phase==='enter'?'0':phase==='update'?'.78':'1';
 const shift=document.documentElement.dataset.toastPosition?.startsWith('top')?-6:6;
 const translate=interrupted?style.translate:phase==='enter'?`0 ${shift}px`:phase==='update'?'0 2px':'0 0';
 state.animation?.cancel();state.animation=undefined;element.dataset.feedbackPhase=phase;
 const done=()=>{if(state.revision!==revision)return;state.animation?.cancel();state.animation=undefined;element.dataset.feedbackPhase=phase==='exit'?'hidden':'visible';finish?.();};
 if(matchMedia('(prefers-reduced-motion:reduce)').matches||!element.isConnected){done();return;}
 const animation=element.animate([{opacity,translate},{opacity:phase==='exit'?0:1,translate:phase==='exit'?`0 ${shift/2}px`:'0 0'}],{duration:phase==='enter'?190:phase==='exit'?130:120,easing:phase==='exit'?'ease-in':'cubic-bezier(.2,.8,.2,1)',fill:'both'});state.animation=animation;
 void animation.finished.then(done,()=>{});
}
/** A new message revokes an older exit before replacing its content. */
export function showFeedback(element:HTMLElement,render:()=>void){
 const state=motionState(element),visible=!element.hidden&&!!element.textContent?.trim(),previous=element.textContent;
 render();element.hidden=false;state.sync?.();
 if(!visible||previous!==element.textContent||element.dataset.feedbackPhase==='exit')animateFeedback(element,visible?'update':'enter');
}
export function dismissFeedback(element:HTMLElement,clear:()=>void){
 if(element.hidden||!element.textContent?.trim()){clear();return;}
 animateFeedback(element,'exit',()=>{clear();motions.get(element)?.sync?.();});
}

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
  const state=motionState(element);if(state.sync)return;
  element.popover='manual';
  const sync=()=>{
    const visible=element.isConnected&&!element.hidden&&(!contentDriven||!!element.textContent?.trim());
    if(contentDriven)element.tabIndex=visible?0:-1;
    if(visible&&!element.matches(':popover-open'))element.showPopover();
    else if(!visible&&element.matches(':popover-open'))element.hidePopover();
  };
  state.sync=sync;new MutationObserver(sync).observe(element,{attributes:true,attributeFilter:['hidden'],childList:contentDriven,characterData:contentDriven,subtree:contentDriven});
  if(contentDriven){element.setAttribute('aria-live','polite');element.setAttribute('aria-atomic','true');enableFeedbackScroll(element);element.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismissFeedback(element,()=>element.textContent='');}});}
  sync();
}

/** Pause dismissal while a notification is being read with a pointer or keyboard. */
export function transientNotice(element:HTMLElement,duration=7000){
  let timer:ReturnType<typeof setTimeout>|undefined;
  const reading=()=>element.matches(':hover,:focus-within');
  const pause=()=>clearTimeout(timer);
  const arm=()=>{pause();if(!reading())timer=setTimeout(()=>{if(!reading())dismissFeedback(element,()=>element.textContent='');},duration);};
  element.addEventListener('mouseenter',pause);element.addEventListener('focusin',pause);
  element.addEventListener('mouseleave',arm);element.addEventListener('focusout',arm);
  return (value:unknown)=>{showFeedback(element,()=>element.textContent=String(value instanceof Error?value.message:value).replace(/^Error invoking remote method '[^']+': Error: /,''));arm();};
}
