import {onRemoval} from './controls';

/** Reveal a compact One toolbar while keeping interrupted transitions continuous. */
const bars=new WeakMap<HTMLElement,{shown:boolean;animation?:Animation}>();
export function revealToolbar(bar:HTMLElement,shown:boolean){
 let state=bars.get(bar);if(!state){state={shown:!bar.hidden};bars.set(bar,state);onRemoval(bar,()=>state?.animation?.cancel());}
 if(state.shown===shown)return;state.shown=shown;
 const startHeight=bar.hidden?0:bar.getBoundingClientRect().height,startOpacity=bar.hidden?0:Number(getComputedStyle(bar).opacity);
 state.animation?.cancel();bar.hidden=false;
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){bar.hidden=!shown;return;}
 const height=bar.getBoundingClientRect().height,easing=getComputedStyle(document.documentElement).getPropertyValue('--ease').trim()||'cubic-bezier(.2,.8,.2,1)';
 const animation=bar.animate([{height:startHeight+'px',opacity:startOpacity,marginBottom:startHeight? '12px':'0px',paddingBlock:startHeight?'8px':'0px'},{height:(shown?height:0)+'px',opacity:shown?1:0,marginBottom:shown?'12px':'0px',paddingBlock:shown?'8px':'0px'}],{duration:200,easing});state.animation=animation;
 animation.onfinish=()=>{if(state?.animation!==animation)return;state.animation=undefined;bar.hidden=!shown;};
}
