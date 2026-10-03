let sequence=0;
/** Use the installed Windows emoji face through Chromium's font loader, without shipping font files. */
export function mountEmojiFont(...hosts:HTMLElement[]){
 let disposed=false,face:FontFace|undefined;
 const source=window.clipperAppearance?.uiFontSource;
 if(source)void (async()=>{
  try{
   const value=await source('Segoe UI Emoji');if(disposed||!value?.url)return;
   const alias='Clipper Emoji '+(++sequence);
   // DirectWrite and the font-file loader choose different OpenType metric tables.
   // Preserve the installed face's baseline when switching to its file source.
   const context=new OffscreenCanvas(1,1).getContext('2d');
   const descriptors:FontFaceDescriptors={};
   if(context){
    context.font="10000px 'Segoe UI Emoji'";
    const metrics=context.measureText('😀');
    descriptors.ascentOverride=metrics.fontBoundingBoxAscent/100+'%';
    descriptors.descentOverride=metrics.fontBoundingBoxDescent/100+'%';
    descriptors.lineGapOverride='0%';
   }
   face=new FontFace(alias,'url('+JSON.stringify(value.url)+')',descriptors);await face.load();
   if(disposed){window.clipperAppearance?.releaseFontResources?.();return;}document.fonts.add(face);
   for(const host of hosts){host.style.setProperty('--reference-emoji-font',JSON.stringify(alias));host.dataset.emojiFont='loaded';}
  }catch{if(!disposed)for(const host of hosts)host.dataset.emojiFont='fallback';}
 })();
 return ()=>{disposed=true;if(face)document.fonts.delete(face);for(const host of hosts){host.style.removeProperty('--reference-emoji-font');delete host.dataset.emojiFont;}};
}
