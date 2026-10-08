function prepare({initialHidden=false,theme='light'}={}){
 fixture.state.dark=theme==='dark';
 const source=fixture.state.clips[0],canvas=document.createElement('canvas');canvas.width=32;canvas.height=24;const ctx=canvas.getContext('2d');ctx.fillStyle='#6e8d7c';ctx.fillRect(0,0,32,24);const image=canvas.toDataURL('image/png');
 const records=Array.from({length:140},(_,n)=>({...source,id:'aux-'+n,hash:'body-'+n,kind:n===1?'image':n===2?'files':'text',thumbnail:n===1?image:undefined,title:'Record '+n,preview:'Private preview '+n,source:'Auxiliary fixture',bytes:1234,updatedAt:1700000000000+n,favorite:false,pinned:false}));
 const changes={tray:new Set(),shelf:new Set()},notices={tray:new Set(),shelf:new Set()};let generation=0,tickets=new Map();
 const text=('Private exact 世界 line\n').repeat(1000);
 const probe={records,image,text,queries:0,shelfReads:0,previews:0,copies:[],drags:[],removals:[],chooses:0,hides:0,pending:[],blockPreview:false,blockShelf:false,blockCopy:false,copyResolve:null,generation:0,lastTokens:{},failUse:false};
 fixture.aux=probe;fixture.auxRefresh=name=>changes[name].forEach(fn=>fn());fixture.auxNotice=(name,value)=>notices[name].forEach(fn=>fn(value));
 const subscribe=(group,fn)=>{group.add(fn);return()=>group.delete(fn);};
 window.clipTray={
  state:async query=>{probe.queries++;generation++;probe.generation=generation;tickets=new Map();let rows=probe.records.filter(i=>(query.kind==='all'||i.kind===query.kind)&&(!query.text||i.title.toLowerCase().includes(query.text.toLowerCase()))&&(query.category!=='favorites'||i.favorite));if(query.category&&!['favorites'].includes(query.category))throw Error('CLIP_TRAY_CATEGORY_MISSING: private missing category');const total=rows.length;rows=rows.slice(0,80);return {items:rows.map(i=>{const token='ticket-'+generation+'-'+i.id;probe.lastTokens[i.id]=token;tickets.set(token,{...i});return {...i,token,previewKey:'opaque-'+i.id+'-'+i.hash,draggable:i.kind==='image'||i.kind==='files'};}),total,categories:[],dark:theme==='dark',canPaste:true};},
  preview:async token=>{probe.previews++;const item=tickets.get(token);if(!item)throw Error('Expired private ticket');const value={token,kind:item.kind,title:item.title,source:item.source,bytes:item.bytes,updatedAt:item.updatedAt,text:item.kind==='text'?probe.text:'',image:item.kind==='image'?probe.image:undefined,files:item.kind==='files'?[{name:'Private.bin',directory:false,saved:true}]:[],truncated:false};if(probe.blockPreview)return new Promise(resolve=>probe.pending.push(()=>resolve(value)));return value;},
  use:async(token,paste)=>{const item=tickets.get(token);if(!item)throw Error('Expired private action ticket');probe.copies.push({id:item.id,token,paste});if(probe.failUse)throw Error('Private use failed');},
  drag:token=>{const item=tickets.get(token);if(!item)throw Error('Expired private drag ticket');probe.drags.push({id:item.id,token});},
  main:async()=>{},hide:async()=>{probe.hides++;},
  onChange:fn=>{subscribe(changes.tray,fn);queueMicrotask(fn);return()=>changes.tray.delete(fn);},onNotice:fn=>subscribe(notices.tray,fn)
 };
 window.clipShelf={
  state:async()=>{probe.shelfReads++;const value={items:structuredClone(probe.records),onTop:true,locked:true,mode:'expanded',dark:theme==='dark'};if(probe.blockShelf)return new Promise(resolve=>probe.pending.push(()=>resolve(value)));return value;},
  copy:async(id,paste)=>{probe.copies.push({id,paste});if(probe.blockCopy)await new Promise(resolve=>probe.copyResolve=resolve);},
  remove:async id=>{probe.removals.push(id);probe.records=probe.records.filter(i=>i.id!==id);fixture.auxRefresh('shelf');},drag:id=>probe.drags.push({id}),hide:async()=>probe.hides++,main:async()=>{},top:async()=>{},
  choose:async()=>probe.chooses++,dropFiles:async()=>{},dropText:async()=>{},mode:async()=>{},
  onChange:fn=>subscribe(changes.shelf,fn),onTransition:()=>()=>{},onNotice:fn=>subscribe(notices.shelf,fn)
 };
 const main=window.clip;window.clip=new Proxy({hide:async()=>probe.hides++,copy:async(id,paste)=>probe.copies.push({id,paste})},{get:(object,key)=>key in object?object[key]:main[key]});

 if(initialHidden)fixture.windowVisible(false);
}
module.exports={prepare};
