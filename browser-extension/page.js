(()=>{
 if(window.__clipperImageDrop)return;window.__clipperImageDrop=true;
 const TYPE='application/x-clipper-images',LIMIT=16*1024*1024,TOTAL=48*1024*1024;
 const cache=new Map(),pending=new Map();let retained=0;
 const href=value=>{try{return new URL(value,document.baseURI).href;}catch{return '';}};
 const original=image=>{
  const src=image.currentSrc||image.src;
  const direct=image.dataset.original||image.dataset.fullSrc||image.dataset.originalSrc;
  if(direct)return href(direct);
  const link=image.closest('a')?.href;
  if(link&&/\.(png|jpe?g|webp|gif|bmp|avif|svg|heic|heif)(?:[?#]|$)/i.test(link))return link;
  try{const url=new URL(src);if(url.hostname==='share.cloudchewie.com'&&/^\/i\/[\w-]+\/thumbnail$/.test(url.pathname)){url.pathname=url.pathname.slice(0,-10);return url.href;}}catch{}
  const set=(image.srcset||'').split(',').map(part=>part.trim().split(/\s+/)).sort((a,b)=>(parseFloat(b[1])||1)-(parseFloat(a[1])||1));
  return href(set[0]?.[0]||src);
 };
 function put(url,data){if(!data||data.length>LIMIT*1.34)return;const previous=cache.get(url);if(previous)retained-=previous.data.length;cache.delete(url);while(cache.size>=32||retained+data.length>TOTAL*1.34){const key=cache.keys().next().value;if(!key)break;retained-=cache.get(key).data.length;cache.delete(key);}cache.set(url,{data,time:Date.now()});retained+=data.length;}
 function encoded(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});}
 async function read(url){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);pending.set(url,controller);
  const chunks=[];let reader;
  try{const response=await fetch(url,{credentials:'include',signal:controller.signal});if(!response.ok||!response.body||Number(response.headers.get('content-length'))>LIMIT)return;reader=response.body.getReader();let size=0;for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>LIMIT)return;chunks.push(part.value);}put(url,await encoded(new Blob(chunks,{type:response.headers.get('content-type')||'application/octet-stream'})));}
  catch{}finally{clearTimeout(timer);controller.abort();await reader?.cancel().catch(()=>{});pending.delete(url);}
 }
 function prepare(image){const url=original(image);if(!/^(https?:|blob:|data:image\/)/i.test(url)||pending.has(url)||pending.size>=4)return;const entry=cache.get(url);if(entry&&Date.now()-entry.time<30000)return;void read(url);}
 function pixels(image){try{if(!image.complete||!image.naturalWidth||image.naturalWidth*image.naturalHeight>40000000)return;const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);const data=canvas.toDataURL('image/png').slice(22);canvas.width=canvas.height=1;return data.length<=LIMIT*1.34?data:undefined;}catch{}}
 const getImage=event=>event.composedPath().find(node=>node instanceof HTMLImageElement);
 for(const name of ['pointerover','pointerdown'])document.addEventListener(name,event=>{const image=getImage(event);if(image)prepare(image);},{capture:true,passive:true});
 document.addEventListener('dragstart',event=>{
  const image=getImage(event);if(!image||!event.dataTransfer)return;
  const url=original(image),entry=cache.get(url),data=entry&&Date.now()-entry.time<30000?entry.data:pixels(image);
  const fallback=href(image.currentSrc||image.src);
  const item=data?{data}:{url,referrer:location.href,...(fallback&&fallback!==url?{fallback}:{})};
  if(data||/^https?:/.test(url))event.dataTransfer.setData(TYPE,JSON.stringify([item]));
 },true);
 window.addEventListener('pagehide',()=>{for(const controller of pending.values())controller.abort();pending.clear();cache.clear();retained=0;});
})();
