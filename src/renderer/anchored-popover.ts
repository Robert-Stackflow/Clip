import {onRemoval} from './controls';

// One's top-layer popup positioning and easing, shared by preview info and actions.
const controllers=new WeakMap<HTMLElement,{open():void;close():void}>();
export function openAnchoredPopover(panel:HTMLElement,anchor:HTMLElement,width=340,maxHeight=470){
 let controller=controllers.get(panel);
 if(!controller){
  let animation:Animation|undefined,opened=false;
  const position=()=>{
   if(!opened||!anchor.isConnected)return;
   const rect=anchor.getBoundingClientRect(),pane=anchor.closest('.content-stage')?.getBoundingClientRect();
   panel.style.width=Math.max(120,Math.min(width,(pane?.width||innerWidth)-32,innerWidth-16))+'px';
   const below=Math.max(0,innerHeight-rect.bottom-14),above=Math.max(0,rect.top-14);
   panel.style.maxHeight=Math.min(maxHeight,Math.max(below,above))+'px';
   const height=panel.getBoundingClientRect().height,useBelow=height<=below||below>=above;
   panel.style.maxHeight=Math.min(maxHeight,useBelow?below:above)+'px';
   panel.style.left=Math.max(8,Math.min(rect.right-panel.getBoundingClientRect().width,innerWidth-panel.getBoundingClientRect().width-8))+'px';
   panel.style.top=Math.max(8,useBelow?rect.bottom+6:rect.top-panel.getBoundingClientRect().height-6)+'px';
   panel.style.transformOrigin=useBelow?'top right':'bottom right';
  };
  const close=()=>{opened=false;animation?.cancel();animation=undefined;if(panel.matches(':popover-open'))panel.hidePopover();window.removeEventListener('resize',position);document.removeEventListener('scroll',position,true);};
  controller={open(){
   if(opened){position();return;}opened=true;panel.popover='manual';panel.classList.add('preview-popover');panel.showPopover();position();
   if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
    const easing=getComputedStyle(document.documentElement).getPropertyValue('--ease').trim()||'cubic-bezier(.2,.8,.2,1)';
    animation=panel.animate([{opacity:0,transform:'translateY(-4px) scale(.98)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:180,easing});
   }
   window.addEventListener('resize',position);document.addEventListener('scroll',position,true);
  },close};controllers.set(panel,controller);onRemoval(panel,close);
 }controller.open();
}
export function closeAnchoredPopover(panel:HTMLElement){controllers.get(panel)?.close();}
