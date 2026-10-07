const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {quickPreviewPlacement,Store,TrayHistory,trayQuery,emptyClipFilters,validateTrayQuery,fileAction,PanelFocusGuard}=require('../work/test-exports.cjs');
test('Hover previews flip, shrink and clamp on taskbar work areas and negative-coordinate displays',()=>{
 const cases=[{panel:{x:20,y:20,width:400,height:560},area:{x:0,y:0,width:1920,height:1040},side:'right'},{panel:{x:1520,y:480,width:400,height:560},area:{x:0,y:0,width:1920,height:1040},side:'left'},{panel:{x:-420,y:400,width:400,height:560},area:{x:-1920,y:30,width:1920,height:1010},side:'left'},{panel:{x:70,y:20,width:400,height:560},area:{x:0,y:0,width:540,height:800},side:'below'},{panel:{x:0,y:0,width:400,height:560},area:{x:0,y:0,width:620,height:600},side:'right'}];
 for(const {panel,area,side} of cases){for(const offset of [5,panel.height-40]){const result=quickPreviewPlacement(panel,{x:panel.x+10,y:panel.y+offset,width:panel.width-20,height:30},area),b=result.bounds;assert.equal(result.side,side);assert(b.x>=area.x&&b.y>=area.y&&b.x+b.width<=area.x+area.width&&b.y+b.height<=area.y+area.height);assert(result.arrow>0&&result.arrow<(side==='below'||side==='above'?b.width:b.height));assert(b.x+b.width<=panel.x||b.x>=panel.x+panel.width||b.y+b.height<=panel.y||b.y>=panel.y+panel.height);}}
 assert.throws(()=>quickPreviewPlacement({x:NaN,y:0,width:4,height:4},{x:0,y:0,width:1,height:1},{x:0,y:0,width:100,height:100}));
});
test('Quick filters and custom categories share status, date, manual and child matching rules',()=>{
 const store=new Store(':memory:');try{const now=Date.now(),first=store.add({text:'parent text'},'A.exe').id,second=store.add({text:'child text'},'B.exe').id,third=store.add({text:'other text'},'A.exe').id;store.update(first,{favorite:true,pinned:true});store.update(second,{favorite:true});
 const category={id:crypto.randomUUID(),name:'Favorites',color:'#f59e0b',kind:'all',contains:'',source:'',tag:'',favorite:true};category.id=store.saveCategory({...category,id:undefined});const manual={...category,id:crypto.randomUUID(),name:'Manual',manual:true,favorite:undefined};manual.id=store.saveCategory({...manual,id:undefined});store.setManualCategory([third],manual.id,true);
 const parent={...category,id:crypto.randomUUID(),name:'Parent',favorite:undefined,contains:'parent',allowChildren:true},child={...parent,id:crypto.randomUUID(),name:'Child',contains:'child',parentId:parent.id};parent.id=store.saveCategory({...parent,id:undefined});child.parentId=parent.id;child.id=store.saveCategory({...child,id:undefined});
 const history=new TrayHistory(()=>store);history.open();assert.equal(history.query({...trayQuery,category:category.id}).total,2);assert.equal(history.query({...trayQuery,category:manual.id}).items[0].id,third);assert.equal(history.query({...trayQuery,category:parent.id}).total,2);
 const filtered=history.query({...trayQuery,filters:{...emptyClipFilters(),favorite:true,sources:['a.exe'],period:'today',size:'small'}});assert.deepEqual(filtered.items.map(i=>i.id),[first]);assert.deepEqual(filtered.sources,[{name:'A.exe',count:1},{name:'B.exe',count:1}]);assert(now<=filtered.items[0].updatedAt);
 assert.equal(history.query({...trayQuery,filters:{...emptyClipFilters(),period:'yesterday'}}).total,0);assert.equal(history.query({...trayQuery,filters:{...emptyClipFilters(),pinned:true}}).total,1);
 for(const filters of [[],{sources:'x'},{sources:[{}]},{period:5},{favorite:'yes'},{tags:['x'.repeat(201)]}])assert.throws(()=>validateTrayQuery({...trayQuery,filters}));
 }finally{store.close();}
});
test('Per-file actions resolve only stored indices, validate existence, preserve missing paths for copy and reject stale records',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'clipper-file-actions-')),file=path.join(folder,'document.txt'),missing=path.join(folder,'missing.txt');await fs.writeFile(file,'fixture');const calls=[],ctx={valid:()=>true,open:async p=>{calls.push(['open',p]);return '';},reveal:p=>calls.push(['reveal',p]),copy:async text=>calls.push(['copy',text])},item={payload:{files:[file,folder,missing]}};
 try{await fileAction(item,0,'open',ctx);await fileAction(item,1,'reveal',ctx);await fileAction(item,2,'copy-path',ctx);await fileAction(item,0,'copy-name',ctx);assert.deepEqual(calls,[['open',file],['reveal',folder],['copy',missing],['copy','document.txt']]);await assert.rejects(fileAction(item,2,'reveal',ctx));await assert.rejects(fileAction(item,0,'open',{...ctx,open:async()=>'Access denied'}));for(const [index,action] of [[-1,'open'],[3,'reveal'],[.5,'open'],[0,{}],[0,'delete']])await assert.rejects(fileAction(item,index,action,ctx));await assert.rejects(fileAction(item,0,'open',{...ctx,valid:()=>false}));await fileAction({payload:{attachments:[{name:'saved.txt',bytes:2}]}},0,'copy-name',ctx);await assert.rejects(fileAction({payload:{attachments:[{name:'saved.txt',bytes:2}]}},0,'reveal',ctx));assert.equal(calls.at(-1)[1],'saved.txt');}
 finally{await fs.rm(folder,{recursive:true,force:true});}
});

test('Panel focus tolerates opening and child surfaces, but closes after an outside departure',()=>{
 const guard=new PanelFocusGuard(1000);assert.equal(guard.check(1600,false,false,false,false),false);assert.equal(guard.check(9000,false,false,false,false),false,'Refused initial activation keeps panel usable');assert.equal(guard.check(9010,false,true,true,false),false);guard.focus();assert.equal(guard.check(9200,false,false,false,false),false);assert.equal(guard.check(9350,false,false,false,false),false);assert.equal(guard.check(9500,false,false,false,false),true);
 const child=new PanelFocusGuard(0);child.focus();assert.equal(child.check(1000,false,true,false,false),false);assert.equal(child.check(5000,false,true,false,false),false);assert.equal(child.check(5100,true,false,false,false),false);assert.equal(child.check(5200,false,false,false,true),false);assert.equal(child.check(5600,false,false,false,true),false);
 const transient=new PanelFocusGuard(0);assert.equal(transient.check(100,true,false,false,false),false);assert.equal(transient.check(400,false,false,false,false),false);assert.equal(transient.check(1200,false,false,false,false),false,'Transient startup activation must not confirm focus');assert.equal(transient.check(1400,true,false,false,false),false);assert.equal(transient.check(1500,false,false,false,false),false);assert.equal(transient.check(1800,false,false,false,false),true);
 const missed=new PanelFocusGuard(0);assert.equal(missed.check(1000,false,false,true,false),true);assert.equal(missed.check(1300,false,false,false,false),true);
});
test('Displayed record remains usable during asynchronous refresh and is revoked on accepted replacement',async()=>{
 const store=new Store(':memory:');try{store.add({text:'Displayed record'},'Fixture');const history=new TrayHistory(()=>store);history.open();const token=history.query(trayQuery).items[0].token,operation=history.operation(token);let finish;const pending=history.queryAsync(trayQuery,()=>new Promise(resolve=>finish=resolve));assert.equal(operation.valid(),true);assert.equal(history.resolve(token).payload.text,'Displayed record');const rows=require('../work/test-exports.cjs').readTrayRows(store.db,store.categories,trayQuery);finish(rows);await pending;assert.equal(operation.valid(),false);assert.throws(()=>history.resolve(token));}finally{store.close();}
});
test('Explicit outside clicks dismiss immediately while opening clicks, child clicks and pastes remain safe',()=>{
 const opening=new PanelFocusGuard(0,true);
 assert.equal(opening.check(20,false,false,true,false),false,'Ignore the click that opened the panel');
 assert.equal(opening.check(30,false,false,false,false),false);
 assert.equal(opening.check(40,false,false,true,false),true,'A new outside click dismisses during startup grace');
 const stillFocused=new PanelFocusGuard(0);
 assert.equal(stillFocused.check(100,true,false,true,false),true,'Dismiss even when an outside surface does not take focus');
 const inside=new PanelFocusGuard(0);
 assert.equal(inside.check(100,false,true,true,false),false,'Keep menus and companion previews interactive');
 assert.equal(inside.check(150,false,false,true,false),false,'Dragging an inside press outside does not become a new click');
 const busy=new PanelFocusGuard(0);
 assert.equal(busy.check(100,false,false,true,true),false);
 assert.equal(busy.check(150,true,false,false,true),false);
 assert.equal(busy.check(200,true,false,false,false),true,'Finish a paste before closing and invalidating its target');
});
