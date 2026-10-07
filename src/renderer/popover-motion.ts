/** Shared motion for anchored action and filter popovers. */
export function popoverMotion(panel:HTMLElement,opening:boolean){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return undefined;
 const direction=panel.dataset.placement==='above'?1:-1;
 return panel.animate(opening?[{opacity:0,transform:`translateY(${direction*4}px) scale(.985)`},{opacity:1,transform:'translateY(0) scale(1)'}]:[{opacity:1,transform:'translateY(0) scale(1)'},{opacity:0,transform:`translateY(${direction*4}px) scale(.985)`}],{duration:opening?180:120,easing:opening?'cubic-bezier(.2,.8,.2,1)':'ease-in',fill:'forwards'});
}
