const {test}=require('node:test'),assert=require('node:assert/strict'),{commitClipboardBlocks,contentBytes,validatePayload,MAX_ITEM}=require('../work/test-exports.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const memory=new Map(),events=[],copies=[],outputs=[],freed=[];let next=1,pointer=1000000n;
 const api={register:()=>60000,alloc:(_flags,size)=>{const id=next++;memory.set(id,{pointer,data:Buffer.alloc(size),locked:false});pointer+=BigInt(size+4096);events.push('alloc');return id;},lock:id=>{const block=memory.get(id);block.locked=true;return block.pointer;},unlock:id=>{memory.get(id).locked=false;events.push('unlock');},copy:async(target,data)=>{const block=[...memory.values()].find(x=>target>=x.pointer&&target<x.pointer+BigInt(x.data.length));assert(block?.locked);const offset=Number(target-block.pointer);assert(offset+data.length<=block.data.length);copies.push(data);await tick();data.copy(block.data,offset);events.push('copy');},free:id=>{assert(!memory.get(id).locked);freed.push(id);memory.delete(id);},open:()=>{events.push('open');return true;},empty:()=>{events.push('empty');return true;},set:(format,id)=>{assert(!memory.get(id).locked);events.push('set');outputs.push({format,id,data:Buffer.from(memory.get(id).data)});return id;},close:()=>events.push('close')};
 return {api,memory,events,copies,outputs,freed};
}
test('clipboard preparation preserves unpadded original bytes and opens only after all copies',async()=>{
 const f=fixture(),source=Buffer.alloc(1024*1024+2);for(let i=0;i<source.length;i++)source[i]=i%251;
 const text=Buffer.from('文字\0','utf16le');await commitClipboardBlocks(f.api,[{format:'App format',base64:source.toString('base64').replace(/=+$/,'')},{format:13,data:text}],123,()=>true);
 assert.deepEqual(f.outputs.map(x=>x.data),[source,text]);assert(Math.max(...f.copies.slice(0,-1).map(b=>b.length))<=196608);assert(f.copies.slice(0,-1).every(b=>b.every(v=>v===0)));assert.deepEqual(text,Buffer.from('文字\0','utf16le'));assert.equal(f.events.filter(x=>x==='open').length,1);assert(f.events.lastIndexOf('copy')<f.events.indexOf('open'));assert.deepEqual(f.freed,[]);
});
test('clipboard cancellation during a pending copy frees unlocked private memory and never opens',async()=>{
 const f=fixture();let live=true,release;const copy=f.api.copy;f.api.copy=async(...args)=>{await new Promise(resolve=>release=resolve);await copy(...args);};
 const writing=commitClipboardBlocks(f.api,[{format:1,base64:Buffer.alloc(400000,42).toString('base64')}],123,()=>live);await tick();live=false;release();await assert.rejects(writing,/取消/);assert.equal(f.memory.size,0);assert.equal(f.events.includes('open'),false);assert(f.copies[0].every(v=>v===0));
});
test('clipboard copy failure unlocks and frees every untransferred handle',async()=>{
 const f=fixture();f.api.copy=async()=>{throw Error('private native copy failed');};await assert.rejects(commitClipboardBlocks(f.api,[{format:1,base64:'YWJj'}],123,()=>true),/copy failed/);assert.equal(f.memory.size,0);assert.equal(f.events.includes('open'),false);
});
test('clipboard registration and allocation failures preserve the old clipboard',async()=>{
 for(const failure of ['register','alloc','lock']){const f=fixture();f.api[failure]=()=>0;await assert.rejects(commitClipboardBlocks(f.api,[{format:'Private app',data:Buffer.from('abc')}],123,()=>true));assert.equal(f.memory.size,0);assert.equal(f.events.includes('open'),false);}
});
test('busy clipboard and failed clear release prepared memory without ownership transfer',async()=>{
 for(const failure of ['open','empty']){const f=fixture();f.api[failure]=()=>false;await assert.rejects(commitClipboardBlocks(f.api,[{format:13,data:Buffer.from('abc')}],123,()=>true));assert.equal(f.memory.size,0);assert.equal(f.outputs.length,0);assert.equal(f.events.includes('close'),failure==='empty');}
});
test('clipboard partial commit frees only handles whose ownership was not transferred',async()=>{
 const f=fixture(),set=f.api.set;f.api.set=(format,id)=>format===2?0:set(format,id);await assert.rejects(commitClipboardBlocks(f.api,[{format:1,data:Buffer.from('a')},{format:2,data:Buffer.from('b')},{format:3,data:Buffer.from('c')}],123,()=>true));assert.deepEqual([...f.memory.keys()],[1]);assert.deepEqual(f.freed,[2,3]);assert.equal(f.events.at(-1),'close');
});
test('raw clipboard bitmap views stay bounded and invalid blocks never allocate',async()=>{
 const f=fixture(),source=Buffer.alloc(9*1024*1024,63);await commitClipboardBlocks(f.api,[{format:17,data:source}],123,()=>true);assert.equal(f.copies.length,3);assert(Math.max(...f.copies.map(x=>x.length))<=4*1024*1024);assert.deepEqual(f.outputs[0].data,source);
 for(const blocks of [[],[{format:1,data:Buffer.alloc(0)}],Array.from({length:38},()=>({format:1,data:Buffer.from('x')}))]){const invalid=fixture();await assert.rejects(commitClipboardBlocks(invalid.api,blocks,123,()=>true),/格式无效/);assert.equal(invalid.memory.size,0);}
});
test('all 32 original formats coexist with the five generated common clipboard blocks',async()=>{
 const f=fixture(),blocks=Array.from({length:37},(_,i)=>({format:100+i,data:Buffer.from([i])}));await commitClipboardBlocks(f.api,blocks,123,()=>true);assert.equal(f.outputs.length,37);for(let i=0;i<37;i++)assert.equal(f.outputs[i].data[0],i);assert.equal(f.freed.length,0);assert.equal(f.events.filter(x=>x==='open').length,1);
});
test('validated content size preserves JSON escaping, Unicode and nested attachment sizes',()=>{
 const binary=Buffer.from([0,1,2,254,255]).toString('base64'),payloads=[{text:'引号"\\\n\t\ud800🙂',html:'<p>text</p>',rtf:'{\\rtf1 text}'},{png:'iVBORw0KGgo'+binary},{formats:[{name:'Private "格式',data:binary}]},{files:['D:\\目录\\含"引号.txt']},{attachments:[{name:'目录',directory:true},{name:'子目录\\文件.txt',data:binary}]}];
 for(const payload of payloads){assert.equal(contentBytes(payload),Buffer.byteLength(JSON.stringify(payload)));const item={id:'id',title:'图片🙂',payload,thumbnail:'data:image/png;base64,'+binary,bytes:1};assert.equal(contentBytes(item),Buffer.byteLength(JSON.stringify(item)));}
});
test('base64 metadata size still rejects combined payloads over the original capacity',()=>{
 const formats=[{name:'Private format',data:Buffer.alloc(11*1024*1024).toString('base64')}],small={formats,text:'x'};assert(contentBytes(small)<MAX_ITEM);assert.deepEqual(validatePayload(small).formats,formats);
 const large={formats,html:'x'.repeat(3*1024*1024)};assert(contentBytes(large)>MAX_ITEM);assert.throws(()=>validatePayload(large),/16 MiB/);
});
