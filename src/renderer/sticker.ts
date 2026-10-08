export {};
interface StickerAPI{state():Promise<{title:string;image?:string;text?:string}>;dragStart():void;move(deltaX:number,deltaY:number):void;dragEnd():void;zoom(direction:number,anchorX:number,anchorY:number):Promise<void>;close():Promise<void>}
declare global{interface Window{clipSticker:StickerAPI}}
const sticker=document.getElementById('sticker')!,content=document.getElementById('content')!;
let imageSticker=false,pressed=false,startPointer={x:0,y:0},moved=false;
void window.clipSticker.state().then(item=>{document.title='Clip · '+item.title;if(item.image){imageSticker=true;sticker.classList.add('image-sticker');const image=document.createElement('img');image.src=item.image;image.alt=item.title;image.draggable=false;content.append(image);}else{sticker.classList.add('note-sticker');const note=document.createElement('pre');note.textContent=item.text||'';content.append(note);}}).catch(error=>{content.textContent=String(error);});
sticker.addEventListener('pointerdown',event=>{if(event.button!==0)return;pressed=true;moved=false;startPointer={x:event.screenX,y:event.screenY};sticker.setPointerCapture(event.pointerId);window.clipSticker.dragStart();});
sticker.addEventListener('pointermove',event=>{if(!pressed)return;const deltaX=event.screenX-startPointer.x,deltaY=event.screenY-startPointer.y;if(Math.hypot(deltaX,deltaY)>3)moved=true;if(moved)window.clipSticker.move(deltaX,deltaY);});
const endDrag=()=>{if(pressed)window.clipSticker.dragEnd();pressed=false;};sticker.addEventListener('pointerup',endDrag);sticker.addEventListener('pointercancel',endDrag);
sticker.addEventListener('dblclick',()=>void window.clipSticker.close());
sticker.addEventListener('wheel',event=>{if(!imageSticker)return;event.preventDefault();const rect=sticker.getBoundingClientRect();void window.clipSticker.zoom(event.deltaY<0?1:-1,(event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height);},{passive:false});
