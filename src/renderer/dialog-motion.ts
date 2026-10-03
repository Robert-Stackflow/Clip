/** One's 120 ms exit; reset protects a reused dialog from an older async close. */
const generations=new WeakMap<HTMLDialogElement,number>();
const pending=new WeakMap<HTMLDialogElement,{promise:Promise<boolean>;cancel:()=>void}>();
const motionProperties=['opacity','transform','backdrop','filter'] as const;
function captureMotion(dialog:HTMLDialogElement,phase:'enter'|'exit'){
 const style=getComputedStyle(dialog),backdrop=getComputedStyle(dialog,'::backdrop');
 const values=[style.opacity,style.transform,backdrop.backgroundColor,backdrop.backdropFilter];
 motionProperties.forEach((property,index)=>dialog.style.setProperty(`--dialog-${phase}-${property}`,values[index]));
}
export function resetDialogMotion(dialog:HTMLDialogElement){
 if(pending.has(dialog)&&dialog.open)captureMotion(dialog,'enter');
 else if(!dialog.open)for(const property of motionProperties)dialog.style.removeProperty('--dialog-enter-'+property);
 generations.set(dialog,(generations.get(dialog)||0)+1);pending.get(dialog)?.cancel();pending.delete(dialog);dialog.classList.remove('closing');
}
export function exitDialog(dialog:HTMLDialogElement):Promise<boolean>{
 const current=pending.get(dialog);if(current)return current.promise;if(!dialog.open)return Promise.resolve(false);captureMotion(dialog,'exit');dialog.classList.add('closing');
 let cancel!:()=>void;const promise=new Promise<boolean>(resolve=>{let done=false;const finish=(valid:boolean)=>{if(done)return;done=true;clearTimeout(timer);pending.delete(dialog);resolve(valid);};
  const timer=setTimeout(()=>finish(dialog.open),matchMedia('(prefers-reduced-motion:reduce)').matches?0:120);cancel=()=>finish(false);
 });pending.set(dialog,{promise,cancel});return promise;
}
export async function closeDialog(dialog:HTMLDialogElement){const generation=generations.get(dialog);if(await exitDialog(dialog)&&generation===generations.get(dialog)){dialog.close();dialog.classList.remove('closing');}}
