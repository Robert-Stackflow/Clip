import {webFrame} from 'electron';
import {fontResourceCleanup} from '../shared/font-resources';
export const fontResources=fontResourceCleanup({
 later:(callback,delay)=>window.setTimeout(callback,delay),cancelLater:id=>window.clearTimeout(id),
 idle:callback=>window.requestIdleCallback(callback),cancelIdle:id=>window.cancelIdleCallback(id),
 activity:callback=>{
  const events=['pointerdown','keydown','wheel','touchstart','input','compositionstart','compositionupdate'];
  const activity=(event:Event)=>{if(event.isTrusted)callback();};
  for(const name of events)document.addEventListener(name,activity,{capture:true,passive:true});
  return ()=>{for(const name of events)document.removeEventListener(name,activity,true);};
 },
 canRelease:()=>!document.querySelector('.reference-page,.reference-loading')&&![...document.fonts].some(face=>face.family.includes('Clip Emoji ')),
 fontBytes:()=>webFrame.getResourceUsage().fonts.size,
 release:()=>webFrame.clearCache(),
});
