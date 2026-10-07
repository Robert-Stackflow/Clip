const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {ChatService,TaskCenter,emptyChatDraft,chatDraft,chatImages,chatShortcut,chatOptions,streamChat}=require('../work/test-exports.cjs');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XkAAAAASUVORK5CYII=';
const profile={id:'fixture',revision:'revision',name:'Fixture',kind:'openai',baseUrl:'http://127.0.0.1/v1',model:'fixture',maxTokens:2048,timeoutSeconds:5,temperature:null,tokenField:'max_tokens'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(saved=new Map()){
 const store={meta:(key,fallback)=>structuredClone(saved.has(key)?saved.get(key):fallback),setMeta:(key,value)=>saved.set(key,structuredClone(value))},calls=[],events=[];
 const ai={state:async()=>({profiles:[profile],defaultId:profile.id}),commands:{list:()=>[],get:(id,revision)=>{assert.equal(id,'translate');assert.equal(revision,'command-revision');return {title:'翻译',prompt:'Translate {{text}} to {{language}}'};}},chat:(value,messages,delta)=>new Promise((resolve,reject)=>calls.push({value,messages,delta,resolve,reject})),cancel:id=>calls.find(call=>call.value.requestId===id)?.reject(new Error('任务已取消'))};
 const tasks=new TaskCenter(store,()=>{}),chat=new ChatService(store,ai,tasks,event=>events.push(event));
 const send=(id,text,extra={})=>chat.send({conversationId:id,profileId:profile.id,revision:profile.revision,approvedDestination:profile.baseUrl+'/chat/completions',text,images:[],language:'简体中文',...extra});
 return {chat,store,ai,tasks,calls,events,send,saved};
}
test('chat validates keyboard shortcuts, draft size and attachment bounds',()=>{
 assert.equal(chatShortcut('Alt+Space'),'Alt+Space');assert.equal(chatShortcut('Control+Shift+A'),'Control+Shift+A');
 for(const value of ['Space','Alt+Alt+Space','Alt+',null])assert.throws(()=>chatShortcut(value));
 const draft={...emptyChatDraft(),text:'你好',images:[{name:'image.png',png}]};assert.deepEqual(chatDraft(draft),draft);assert.throws(()=>chatDraft({...draft,text:'中'.repeat(100000)}));assert.throws(()=>chatImages(Array(5).fill(draft.images[0])));assert.throws(()=>chatImages([{name:'bad',png:'invalid'}]));
});
test('chat window defaults migrate older settings and retain both toggle states',()=>{
 assert.deepEqual(chatOptions({shortcut:'Alt+Space'}),{shortcut:'Alt+Space',onTop:true,keepOpen:true});
 assert.deepEqual(chatOptions({shortcut:'Control+Shift+A',onTop:false,keepOpen:false}),{shortcut:'Control+Shift+A',onTop:false,keepOpen:false});
 for(const value of [null,[],{onTop:'false'},{keepOpen:0}])assert.throws(()=>chatOptions(value));
});
test('chat streams offset deltas, retains complete multi-turn roles and preserves separate drafts',async()=>{
 const f=fixture(),id=f.chat.create();await f.send(id,'hello');assert.deepEqual(f.calls[0].messages.map(m=>m.role),['system','user']);
 f.calls[0].delta('你');f.calls[0].delta('好');assert.deepEqual(f.events.filter(e=>e.type==='delta').map(e=>e.offset),[0,1]);
 f.calls[0].resolve({text:'你好',model:'fixture'});await tick();await f.send(id,'continue');assert.deepEqual(f.calls[1].messages.slice(1).map(m=>[m.role,m.content]),[['user','hello'],['assistant','你好'],['user','continue']]);
 f.calls[1].resolve({text:'continued'});await tick();const other=f.chat.create();f.chat.draft(other,{...emptyChatDraft(),text:'private draft'},profile.id);assert.equal((await f.chat.state(id)).conversation.draft.text,'');assert.equal((await f.chat.state(other)).conversation.draft.text,'private draft');
 assert.equal(f.tasks.state().items[0].conversationId,id);f.chat.dispose();
});
test('chat cancellation, retry and failed context omission do not duplicate the user message',async()=>{
 const f=fixture(),id=f.chat.create();await f.send(id,'first');f.chat.cancel(id);await tick();assert.equal((await f.chat.state(id)).conversation.messages.at(-1).status,'cancelled');
 f.chat.retry(id,profile.id,profile.revision,profile.baseUrl+'/chat/completions');assert.equal((await f.chat.state(id)).conversation.messages.length,2);f.calls[1].reject(new Error('fixture network failure'));await tick();await f.send(id,'second');assert.deepEqual(f.calls[2].messages.slice(1).map(m=>m.content),['second']);f.calls[2].resolve({text:'ok'});await tick();f.chat.dispose();
});
test('chat checks stale services and simultaneous sends, resolves commands and retains images',async()=>{
 const f=fixture(),id=f.chat.create();await assert.rejects(f.send(id,'stale',{revision:'old'}),/配置已改变/);assert.equal(f.calls.length,0);
 const value={command:{id:'translate',revision:'command-revision',values:{}},images:[{name:'fixture.png',png}],language:'English'};
 await f.send(id,'文字',value);assert.match(f.calls[0].messages.at(-1).content,/English/);assert.match(f.calls[0].messages.at(-1).content,/文字/);assert.deepEqual(f.calls[0].messages.at(-1).images,value.images);await assert.rejects(f.send(id,'double'),/等待当前回复/);
 f.tasks.cancel(f.tasks.state().items[0].id);await tick();assert.equal((await f.chat.state(id)).conversation.messages.at(-1).status,'cancelled');f.chat.dispose();
});
test('chat survives reopen, recovers interrupted replies and removes deleted conversations',async()=>{
 const f=fixture(),id=f.chat.create();f.chat.draft(id,{...emptyChatDraft(),text:'saved draft'},profile.id);const reopened=fixture(f.saved);assert.equal((await reopened.chat.state(id)).conversation.draft.text,'saved draft');
 await f.send(id,'in flight');const recovered=fixture(f.saved);assert.equal((await recovered.chat.state(id)).conversation.messages.at(-1).status,'cancelled');
 recovered.chat.remove(id);await assert.rejects(recovered.chat.state(id),/已不存在/);f.chat.dispose();reopened.chat.dispose();recovered.chat.dispose();await tick();
});
async function serverTest(fn,execute){const requests=[];const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;requests.push(JSON.parse(body));fn(res);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{await execute({...profile,baseUrl:'http://127.0.0.1:'+server.address().port+'/v1'},requests);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
test('OpenAI streaming handles fragmented UTF-8 and preserves image and assistant roles',async()=>{
 await serverTest(res=>{res.setHeader('Content-Type','text/event-stream');const bytes=Buffer.from('data: '+JSON.stringify({choices:[{delta:{content:'你好 🙂'}}]})+'\r\n\r\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');let index=0;const timer=setInterval(()=>{if(index<bytes.length)res.write(bytes.subarray(index,index+=1));else{clearInterval(timer);res.end();}},1);res.on('close',()=>clearInterval(timer));},async(p,requests)=>{const deltas=[],result=await streamChat(p,[{role:'user',content:'看图',images:[{name:'image',png}]},{role:'assistant',content:'previous'}],'',new AbortController().signal,text=>deltas.push(text));assert.equal(result.text,'你好 🙂');assert.equal(deltas.join(''),result.text);assert.equal(requests[0].messages[0].content[1].image_url.url,'data:image/png;base64,'+png);assert.equal(requests[0].messages[1].role,'assistant');assert.equal(requests[0].stream,true);});
});
test('Ollama streaming supports NDJSON, completed fallback and incomplete stream errors',async()=>{
 await serverTest(res=>{res.setHeader('Content-Type','application/x-ndjson');res.end('{"message":{"content":"one"},"done":false}\n{"message":{"content":" two"},"done":true}\n');},async(p)=>assert.equal((await streamChat({...p,kind:'ollama'},[{role:'user',content:'fixture'}],'',new AbortController().signal,()=>{})).text,'one two'));
 await serverTest(res=>{res.setHeader('Content-Type','application/json');res.end('{"choices":[{"message":{"content":"fallback"}}]}');},async(p)=>assert.equal((await streamChat(p,[],'',new AbortController().signal,()=>{})).text,'fallback'));
 await serverTest(res=>{res.setHeader('Content-Type','text/event-stream');res.end('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');},async(p)=>assert.rejects(streamChat(p,[],'',new AbortController().signal,()=>{}),/连接中断/));
});
test('stream cancellation interrupts an open HTTP request',async()=>{
 await serverTest(res=>{res.setHeader('Content-Type','text/event-stream');res.write('data: {"choices":[{"delta":{"content":"start"}}]}\n\n');},async(p)=>{const controller=new AbortController();await assert.rejects(streamChat(p,[],'',controller.signal,()=>controller.abort()),/abort/i);});
});

test('custom chat names persist and are not overwritten by the first message',async()=>{
 const f=fixture(),id=f.chat.create();for(const title of ['', ' '.repeat(10),'a'.repeat(121),null])assert.throws(()=>f.chat.rename(id,title));f.chat.rename(id,'  研究笔记  ');await f.send(id,'首条消息');f.calls[0].resolve({text:'ok'});await tick();assert.equal((await f.chat.state(id)).conversation.title,'研究笔记');const reopened=fixture(f.saved);assert.equal((await reopened.chat.state(id)).conversation.title,'研究笔记');f.chat.dispose();reopened.chat.dispose();
});

test('chat model choices are validated, forwarded and retained through retry and restart',async()=>{
 const f=fixture(),id=f.chat.create();const old=f.ai.state;f.ai.state=async()=>{const state=await old();return {...state,profiles:state.profiles.map(p=>({...p,kind:'codex',model:'first',models:[{id:'first',name:'Fast',reasoningEfforts:['low']},{id:'second',name:'Deep',reasoningEfforts:['medium','high']}]}))};};
 await assert.rejects(f.send(id,'unknown',{modelId:'missing'}),/模型已不存在/);await assert.rejects(f.send(id,'bad effort',{modelId:'first',reasoningEffort:'high'}),/不支持/);assert.equal((await f.chat.state(id)).conversation.messages.length,0);
 await f.send(id,'selected',{modelId:'second',reasoningEffort:'high'});assert.equal(f.calls[0].value.modelId,'second');assert.equal(f.calls[0].value.reasoningEffort,'high');f.calls[0].reject(Error('fixture'));await tick();f.chat.retry(id,profile.id,profile.revision,profile.baseUrl+'/chat/completions');assert.equal(f.calls[1].value.modelId,'second');assert.equal(f.calls[1].value.reasoningEffort,'high');f.calls[1].resolve({text:'ok'});await tick();const reopened=fixture(f.saved);assert.equal((await reopened.chat.state(id)).conversation.draft.modelId,'second');assert.equal((await reopened.chat.state(id)).conversation.draft.reasoningEffort,'high');f.chat.dispose();reopened.chat.dispose();
});
