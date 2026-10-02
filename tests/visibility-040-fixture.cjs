function prepare({hidden=false}){
 const base=window.clipper,model={...fixture.state.clips[0]},text=('Private full reader 世界 '+'.'.repeat(54)+'\r\n').repeat(10000)+'END_VISIBILITY_040';
 fixture.state.clips=[{...model,id:'small',title:'Small text',favorite:false},{...model,id:'large',hash:'large-v1',kind:'image',title:'Large image',favorite:false},{...model,id:'reader',hash:'reader-v1',kind:'text',title:'Long text',favorite:false},{...model,id:'code',hash:'code-v1',kind:'code',title:'Folded code',favorite:false}];
 const snippet={createdAt:model.createdAt,updatedAt:model.updatedAt,shortcut:'',tags:[]};fixture.state.snippets=[{...snippet,id:'large-reply',title:'Image reply',kind:'image',revision:1,text:''},{...snippet,id:'reader-reply',title:'Text reply',kind:'text',revision:1,text:'Small projected text'}];
 window.probe={details:0,released:[],leases:[],block:false,pending:[],workers:0,terminated:0,requests:0,text};
 const WorkerBase=Worker;window.Worker=class extends WorkerBase{constructor(...args){super(...args);probe.workers++;probe.requests++;this.ended=false;}terminate(){if(!this.ended){this.ended=true;probe.workers--;probe.terminated++;}super.terminate();}};
 const projected=(id,snippet=false)=>{probe.details++;const meta=snippet?fixture.state.snippets.find(s=>s.id===id):fixture.state.clips.find(s=>s.id===id),image=id.includes('large');const result={...meta,payload:image?{png:true}:{text:id.includes('reader')?probe.text:id==='code'?'function outer() {\n  const inside = 1;\n  return inside;\n}\n'.repeat(5000):'Short fixture'},...(snippet?{text:id.includes('reader')?probe.text:''}:{})};if(image){const url='clipper://app/preview-image/private-'+probe.details;result.imageURL=url;probe.leases.push(url);}return probe.block?new Promise(resolve=>probe.pending.push(()=>resolve(result))):Promise.resolve(result);};
 window.clipper=new Proxy({preview:id=>projected(id),snippetPreview:id=>projected(id,true),releasePreview:async url=>{probe.released.push(url);},search:async()=>fixture.state.clips.map(c=>c.id)}, {get:(o,k)=>k in o?o[k]:base[k]});
 fixture.windowVisible(!hidden);
}
module.exports={prepare};
