const {test}=require('node:test'),assert=require('node:assert/strict');
const {quickGlyph,quickRecent,rememberGlyph,quickPanelBounds,anchoredQuickPanelBounds,quickShortcut,QUICK_SHORTCUT,TrayHistory,QuickReplies,Store,trayQuery,framePNG,fillTemplate}=require('../work/test-exports.cjs');
test('Quick panel accepts Unicode glyphs and rejects invalid or unbounded input',()=>{
 for(const value of [{tab:'emoji',text:'👩‍💻'},{tab:'kaomoji',text:'( •̀ ω •́ )✧'},{tab:'symbols',text:'∞'}])assert.deepEqual(quickGlyph({...value,private:'discard'}),value);
 for(const value of [null,{},[],{tab:'clipboard',text:'x'},{tab:'emoji',text:' '},{tab:'symbols',text:'a\n'},{tab:'symbols',text:'\0'},{tab:'emoji',text:'a'.repeat(129)}])assert.throws(()=>quickGlyph(value));
 assert.equal(quickShortcut('Win+Alt+V'),'Alt+Super+V');assert.equal(quickShortcut('Ctrl+Alt+V'),QUICK_SHORTCUT);assert.throws(()=>quickShortcut('V'));
});
test('Recent glyphs deduplicate, sanitize persisted data and retain a bounded MRU order',()=>{
 const first={tab:'emoji',text:'😀'},second={tab:'symbols',text:'∞'};assert.deepEqual(quickRecent([first,first,null,second,{tab:'x',text:'secret'}]),[first,second]);assert.deepEqual(quickRecent({}),[]);
 const history=Array.from({length:32},(_,i)=>({tab:'symbols',text:String(i)})),next=rememberGlyph(history,first);assert.equal(next.length,32);assert.deepEqual(next[0],first);assert.deepEqual(next.at(-1),history[30]);assert.deepEqual(rememberGlyph(next,history[3]).slice(0,2),[history[3],first]);assert.equal(history.length,32);
});
test('Compact bounds stay inside negative-coordinate, small and bottom-right displays',()=>{
 for(const [point,area] of [[{x:-1,y:200},{x:-1920,y:0,width:1920,height:1080}],[{x:1919,y:1079},{x:0,y:0,width:1920,height:1080}],[{x:20,y:20},{x:0,y:0,width:300,height:400}]]){
  const rect=quickPanelBounds(point,area);assert(rect.x>=area.x&&rect.y>=area.y);assert(rect.x+rect.width<=area.x+area.width&&rect.y+rect.height<=area.y+area.height);assert.equal(rect.width,Math.min(400,area.width));assert.equal(rect.height,Math.min(560,area.height));
 }
 assert.throws(()=>quickPanelBounds({x:NaN,y:0},{x:0,y:0,width:500,height:500}));
});
test('Compact previews prefer thumbnails without weakening history capabilities',()=>{
 const store=new Store(':memory:'),png=framePNG({width:2,height:2,data:Buffer.alloc(16,255)}).toString('base64'),thumb='data:image/png;base64,'+png,item=store.add({png},'Fixture.exe',thumb);let reads=0;const history=new TrayHistory(()=>store,Date.now,()=>{reads++;return 'clip://image/original';});
 try{history.open();const token=history.query(trayQuery).items[0].token;assert.equal(history.preview(token,true).image,thumb);assert.equal(reads,0);assert.equal(history.preview(token).image,'clip://image/original');assert.equal(reads,1);store.delete(item.id);assert.throws(()=>history.preview(token,true));history.close();assert.throws(()=>history.preview(token,true));}finally{store.close();}
});
test('Pinned panel queries find older records beyond the recent page and combine text and type filters',()=>{
 const store=new Store(':memory:');try{
  const pinned=store.add({text:'older café '+ 'full body '.repeat(100)+'末尾'},'Fixture',undefined,{pinned:true,updatedAt:1},false);
  for(let i=0;i<95;i++)store.add({text:'ordinary '+i},'Fixture',undefined,{updatedAt:100+i},false);
  const history=new TrayHistory(()=>store);history.open();assert(!history.query(trayQuery).items.some(item=>item.id===pinned.id));
  assert.equal(history.query(trayQuery,true).items[0].id,pinned.id);assert.equal(history.query({...trayQuery,kind:'text'},true).items[0].id,pinned.id);
  assert.deepEqual(history.query({...trayQuery,category:'pinned',text:'café 末尾',kind:'text'}).items.map(item=>item.id),[pinned.id]);
  assert.equal(history.query({...trayQuery,category:'pinned',kind:'image'}).items.length,0);history.close();
 }finally{store.close();}
});
test('Quick replies preserve order, search complete text, expose compact metadata and fill existing templates',()=>{
 const store=new Store(':memory:');try{
  const first=store.saveSnippet({title:'Template',text:'你好 {{姓名}}，日期 {{日期}}'}),second=store.saveSnippet({title:'Long reply',text:'头部'.repeat(150)+'末尾 café'}),file=store.saveSnippet({title:'File reply',payload:{attachments:[{name:'secret.txt',data:Buffer.from('PRIVATE-BYTES').toString('base64')}]}});
  store.reorderSnippets([first,file,second]);const replies=new QuickReplies(()=>store);replies.open();const state=replies.query('');
  assert.deepEqual(state.items.map(item=>item.title),['Template','File reply','Long reply']);assert.deepEqual(state.items[0].variables,['姓名']);assert.equal('payload' in state.items[1],false);assert(!JSON.stringify(state).includes('PRIVATE-BYTES'));assert.equal(state.items[2].preview.length,240);
  const operation=replies.operation(state.items[0].token);assert.equal(fillTemplate(operation.item.payload,{'姓名':'小明'},new Date(2026,9,7)).text,'你好 小明，日期 2026-10-07');
  assert.equal(replies.query('café 末尾').items[0].title,'Long reply');assert(!operation.valid());assert.throws(()=>replies.operation(state.items[0].token));
  for(const value of [null,{},'x'.repeat(513)])assert.throws(()=>replies.query(value));replies.close();assert.throws(()=>replies.query(''));
 }finally{store.close();}
});
test('Reply capabilities reject edits, deletion, expiration, store changes and closed/reopened sessions',()=>{
 const store=new Store(':memory:'),other=new Store(':memory:');let selected=store,now=1;try{
  const id=store.saveSnippet({title:'Reply',text:'Original'}),replies=new QuickReplies(()=>selected,()=>now);replies.open();const token=()=>replies.query('').items[0].token;
  let ticket=token(),operation=replies.operation(ticket);assert(operation.valid());store.saveSnippet({id,title:'Reply',text:'Edited'});assert(!operation.valid());assert.throws(()=>replies.operation(ticket));
  ticket=token();operation=replies.operation(ticket);now+=600001;assert(!operation.valid());assert.throws(()=>replies.operation(ticket));
  ticket=token();selected=other;assert.throws(()=>replies.operation(ticket));selected=store;
  ticket=token();operation=replies.operation(ticket);replies.close();assert(!operation.valid());replies.open();assert.throws(()=>replies.operation(ticket));
  ticket=token();store.removeSnippet(id);assert.throws(()=>replies.operation(ticket));
 }finally{store.close();other.close();}
});
test('Clearing history leaves pinned, favorite and quick replies intact and undo restores complete ordinary payloads',()=>{
 const store=new Store(':memory:');try{
  const pinned=store.add({text:'Pinned'},'Fixture',undefined,{pinned:true}),favorite=store.add({text:'Favorite'},'Fixture',undefined,{favorite:true}),ordinary=store.add({text:'Ordinary',html:'<b>Ordinary</b>'},'Fixture'),reply=store.saveSnippet({title:'Reply',text:'Reusable'});
  store.clear();assert.deepEqual(new Set(store.list().map(item=>item.id)),new Set([pinned.id,favorite.id]));assert.equal(store.snippet(reply).text,'Reusable');store.undo();assert.deepEqual(store.get(store.db.prepare('SELECT id FROM clips WHERE hash=?').get(ordinary.hash).id).payload,ordinary.payload);assert.equal(store.snippet(reply).text,'Reusable');
 }finally{store.close();}
});

test('Quick panel follows the caret, flips above it, and falls back to the active window rather than the mouse',()=>{
 const area={x:0,y:0,width:1920,height:1080},window={x:100,y:80,width:1100,height:800};
 assert.deepEqual(anchoredQuickPanelBounds(area,window,{x:450,y:130,width:1,height:20}),{x:450,y:158,width:400,height:560});
 assert.deepEqual(anchoredQuickPanelBounds(area,window,{x:450,y:930,width:1,height:20}),{x:450,y:362,width:400,height:560});
 assert.deepEqual(anchoredQuickPanelBounds(area,window),{x:792,y:312,width:400,height:560});
 assert.deepEqual(anchoredQuickPanelBounds(area),{x:1512,y:512,width:400,height:560});
 for(const screen of [{x:-1920,y:-100,width:1920,height:1080},{x:0,y:0,width:300,height:400}])for(const caret of [undefined,{x:screen.x+screen.width-1,y:screen.y+screen.height-20,width:1,height:20}]){
  const bounds=anchoredQuickPanelBounds(screen,undefined,caret);assert(bounds.x>=screen.x&&bounds.y>=screen.y&&bounds.x+bounds.width<=screen.x+screen.width&&bounds.y+bounds.height<=screen.y+screen.height);
 }
});
