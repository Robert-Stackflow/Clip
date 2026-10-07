import {onRemoval} from './controls';
import {popoverMotion} from './popover-motion';

// One's top-layer popup positioning and easing, shared by preview info and actions.
const controllers=new WeakMap<HTMLElement,{open():void;close():void}>();
export function openAnchoredPopover(panel:HTMLElement,anchor:HTMLElement,width=340,maxHeight=470){
 let controller=controllers.get(panel);
 if(!controller){
  let animation:Animation|undefined,opened=false;
  const resize=new ResizeObserver(()=>position());
  const position=()=>{
   if(!opened||!anchor.isConnected)return;
   const rect=anchor.getBoundingClientRect(),pane=anchor.closest('.content-stage')?.getBoundingClientRect();
   panel.style.width=Math.max(120,Math.min(width,(pane?.width||innerWidth)-32,innerWidth-16))+'px';
   const below=Math.max(0,innerHeight-rect.bottom-14),above=Math.max(0,rect.top-14);
   panel.style.maxHeight=Math.min(maxHeight,Math.max(below,above))+'px';
   // Entrance animations scale the painted bounds; placement uses the stable layout size.
   const height=panel.offsetHeight,useBelow=height<=below||below>=above;
   panel.style.maxHeight=Math.min(maxHeight,useBelow?below:above)+'px';
   const panelWidth=panel.offsetWidth;
   panel.style.left=Math.max(8,Math.min(rect.right-panelWidth,innerWidth-panelWidth-8))+'px';
   panel.style.top=Math.max(8,useBelow?rect.bottom+6:rect.top-panel.offsetHeight-6)+'px';
   panel.style.transformOrigin=useBelow?'top right':'bottom right';
   panel.dataset.placement=useBelow?'below':'above';
  };
  const hide=()=>{if(panel.matches(':popover-open'))panel.hidePopover();animation?.cancel();animation=undefined;};
  const close=()=>{opened=false;resize.disconnect();animation?.cancel();animation=undefined;window.removeEventListener('resize',position);document.removeEventListener('scroll',position,true);if(!panel.matches(':popover-open'))return;animation=panel.isConnected?popoverMotion(panel,false):undefined;const current=animation;if(current)void current.finished.then(()=>{if(!opened&&animation===current)hide();}).catch(()=>{});else hide();};
  controller={open(){
   if(opened){position();return;}opened=true;animation?.cancel();panel.popover='manual';panel.classList.add('preview-popover','clipper-popover');if(!panel.matches(':popover-open'))panel.showPopover();position();animation=popoverMotion(panel,true);if(animation){const current=animation;void current.finished.then(()=>{if(animation===current){current.cancel();animation=undefined;}}).catch(()=>{});}
   resize.observe(panel);window.addEventListener('resize',position);document.addEventListener('scroll',position,true);
  },close};controllers.set(panel,controller);onRemoval(panel,close);
 }controller.open();
}
export function closeAnchoredPopover(panel:HTMLElement){controllers.get(panel)?.close();}
