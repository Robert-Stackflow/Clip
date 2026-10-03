/** A page-scoped 384-image LRU; the worker holds at most three decoded sprite pages. */
export class EmojiRasterizer{
 private worker:Worker|undefined;
 private cache=new Map<string,ImageBitmap>();
 private targets=new Map<string,Set<HTMLCanvasElement>>();
 private frame=0;
 private failed=false;
 private disposed=false;
 constructor(){try{this.worker=new Worker(new URL('./reference-emoji-worker.js',location.href));this.worker.onmessage=event=>{if(this.disposed){event.data.bitmap?.close();return;}const {glyph,bitmap}=event.data as {glyph:string;bitmap?:ImageBitmap};if(bitmap){this.cache.get(glyph)?.close();this.cache.delete(glyph);this.cache.set(glyph,bitmap);for(const canvas of this.targets.get(glyph)||[])this.draw(canvas,bitmap);this.trim();}else for(const canvas of this.targets.get(glyph)||[])this.fallback(canvas,glyph);};this.worker.onerror=()=>{this.failed=true;this.worker?.terminate();this.worker=undefined;for(const [glyph,targets]of this.targets)for(const canvas of targets)this.fallback(canvas,glyph);};}catch{this.failed=true;}}
 private draw(canvas:HTMLCanvasElement,bitmap:ImageBitmap){const context=canvas.getContext('2d')!;context.clearRect(0,0,96,96);context.drawImage(bitmap,0,0);canvas.classList.add('ready');}
 private fallback(canvas:HTMLCanvasElement,glyph:string){const span=document.createElement('span');span.className='reference-glyph';span.textContent=glyph;canvas.replaceWith(span);}
 attach(root:HTMLElement){for(const canvas of root.querySelectorAll<HTMLCanvasElement>('canvas[data-emoji]')){const glyph=canvas.dataset.emoji!;if(this.failed){this.fallback(canvas,glyph);continue;}let targets=this.targets.get(glyph);if(targets?.has(canvas))continue;if(!targets){targets=new Set();this.targets.set(glyph,targets);}targets.add(canvas);const bitmap=this.cache.get(glyph);if(bitmap){this.cache.delete(glyph);this.cache.set(glyph,bitmap);this.draw(canvas,bitmap);}}this.schedule();}
 detach(root:HTMLElement){for(const canvas of root.querySelectorAll<HTMLCanvasElement>('canvas[data-emoji]')){const glyph=canvas.dataset.emoji!,targets=this.targets.get(glyph);targets?.delete(canvas);if(!targets?.size)this.targets.delete(glyph);}this.schedule();}
 private schedule(){if(!this.frame&&!this.disposed)this.frame=requestAnimationFrame(()=>{this.frame=0;this.trim();this.worker?.postMessage({glyphs:[...this.targets].filter(([glyph,targets])=>!this.cache.has(glyph)&&[...targets].some(canvas=>!canvas.classList.contains('ready'))).map(([glyph])=>glyph)});});}
 private trim(){for(const [glyph,bitmap]of this.cache){if(this.cache.size<=384)break;bitmap.close();this.cache.delete(glyph);}}
 clear(){this.targets.clear();this.schedule();}
 dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.worker?.terminate();this.worker=undefined;for(const bitmap of this.cache.values())bitmap.close();this.cache.clear();this.targets.clear();}
}
