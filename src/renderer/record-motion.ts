/** Animate committed removals and record moves using retained list elements. */
export function recordRemoval(root:HTMLElement|undefined,selector:string,removed:(node:HTMLElement)=>boolean){
 if(!root||matchMedia('(prefers-reduced-motion:reduce)').matches)return ()=>{};
 const viewport=root.getBoundingClientRect(),rows=Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(row=>!row.classList.contains('record-removal-ghost')),before=new Map<HTMLElement,DOMRect>(),ghosts:HTMLElement[]=[];
 for(const row of rows){const rect=row.getBoundingClientRect();if(rect.bottom<=viewport.top||rect.top>=viewport.bottom||rect.right<=viewport.left||rect.left>=viewport.right)continue;
  if(removed(row)){const ghost=row.cloneNode(true) as HTMLElement,paint=getComputedStyle(row);ghost.removeAttribute('id');ghost.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));ghost.setAttribute('aria-hidden','true');ghost.inert=true;ghost.classList.add('record-removal-ghost');Object.assign(ghost.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',margin:'0',zIndex:'10',pointerEvents:'none',backgroundColor:paint.backgroundColor,borderColor:paint.borderColor,boxShadow:paint.boxShadow,transition:'none'});const livePaint=Array.from(row.querySelectorAll<HTMLElement>('[data-motion-appearance]'));ghost.querySelectorAll<HTMLElement>('[data-motion-appearance]').forEach((node,index)=>{node.style.opacity=getComputedStyle(livePaint[index]).opacity;node.style.transition='none';});ghosts.push(ghost);}else before.set(row,rect);
 }
 return ()=>{
  const play=()=>{
  if(!root.isConnected)return;
  for(const ghost of ghosts){root.append(ghost);const motion=ghost.animate([{opacity:1,transform:'scale(1)'},{opacity:0,transform:'translateY(-8px) scale(.96)'}],{duration:180,easing:'ease-out',fill:'forwards'});void motion.finished.catch(()=>{}).finally(()=>ghost.remove());}
  for(const [row,rect] of before)if(row.isConnected){const after=row.getBoundingClientRect(),x=rect.left-after.left,y=rect.top-after.top;if(Math.abs(x)+Math.abs(y)>1)row.animate([{transform:`translate(${x}px,${y}px)`},{transform:'translate(0,0)'}],{duration:200,easing:'cubic-bezier(.2,.8,.2,1)'});}
  };
  const dialog=document.querySelector<HTMLDialogElement>('dialog[open]');if(dialog)dialog.addEventListener('close',play,{once:true});else play();
 };
}
