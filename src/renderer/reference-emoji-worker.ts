// Decode a bounded set of offline sprite pages away from the UI thread.
import art from './reference-data/emoji-art.json';
const glyphs:Record<string,number>=art.glyphs;
const pages=new Map<number,ImageBitmap>();
let queue:string[]=[],running=false;
const canvas=new OffscreenCanvas(96,96),context=canvas.getContext('2d')!;
const send=self.postMessage.bind(self) as (value:unknown,transfer:Transferable[])=>void;
async function page(index:number){
 let bitmap=pages.get(index);
 if(!bitmap){const response=await fetch(new URL('./emoji-atlas/'+art.pages[index].file,self.location.href));if(!response.ok)throw new Error('Emoji asset unavailable');bitmap=await createImageBitmap(await response.blob());}
 pages.delete(index);pages.set(index,bitmap);
 while(pages.size>3){const oldest=pages.keys().next().value!;pages.get(oldest)!.close();pages.delete(oldest);}
 return bitmap;
}
async function drain(){
 if(running)return;running=true;
 while(queue.length){const glyph=queue.shift()!;
  try{const index=glyphs[glyph];if(index===undefined)throw new Error('Unknown emoji');const perPage=art.columns**2,bitmap=await page(Math.floor(index/perPage)),cell=index%perPage;
   context.clearRect(0,0,96,96);context.drawImage(bitmap,cell%art.columns*art.tileSize,Math.floor(cell/art.columns)*art.tileSize,art.tileSize,art.tileSize,0,0,96,96);
   const result=canvas.transferToImageBitmap();send({glyph,bitmap:result},[result]);
  }catch{send({glyph,error:true},[]);}
 }
 running=false;
}
self.onmessage=(event:MessageEvent<{glyphs:string[]}>)=>{queue=event.data.glyphs;void drain();};
