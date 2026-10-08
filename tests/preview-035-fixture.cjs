function prepare({theme,kind}){
 fixture.state.dark=theme==='dark';const base=clip;
 const text=(kind==='code'?'const greeting = "Hello 世界";\r\n':'')+('保存 · literal <script> & "中文" 😃\r\n').repeat(kind==='long-line'?0:10000)+(kind==='long-line'?('0123456789 <tag> 中文 😃 ').repeat(32000):'')+'\rEND_PRIVATE_035_世界😃';
 const clip={...fixture.state.clips[0],id:'reader',kind:kind==='code'?'code':'text',favorite:false,title:'Full text fixture',preview:'Private sample',hash:'reader-v1',bytes:new TextEncoder().encode(text).length};fixture.state.clips.push(clip);
 window.test={text,details:0,copies:[],hide:0,workers:0,terminated:0,workerRequests:0};
 const OriginalWorker=Worker;window.Worker=class extends OriginalWorker{constructor(...args){super(...args);test.workers++;test.workerRequests++;this.ended=false;}terminate(){if(!this.ended){this.ended=true;test.terminated++;test.workers--;}super.terminate();}};
 window.clip=new Proxy({detail:id=>{test.details++;if(id!=='reader')return base.detail(id);if(test.block)return new Promise(resolve=>test.resolve=()=>resolve({...clip,payload:{text:test.text}}));return Promise.resolve({...clip,payload:{text:test.text}});},copy:async(...args)=>test.copies.push(args),hide:async()=>test.hide++,search:async()=>fixture.state.clips.map(c=>c.id)},{get:(o,k)=>k in o?o[k]:base[k]});
}
module.exports={prepare};
