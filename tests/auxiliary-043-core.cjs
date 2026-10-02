const {test}=require('node:test'),assert=require('node:assert/strict');
const {Store,TrayHistory,trayQuery}=require('../work/test-exports.cjs');
function use(work){const store=new Store(':memory:');try{work(store);}finally{store.close();}}
test('Tray preview identity stays opaque while every query renews action capabilities',()=>use(store=>{
 const clip=store.add({text:'Private complete body'},'fixture'),history=new TrayHistory(()=>store);history.open();const a=history.query(trayQuery).items[0],operation=history.operation(a.token),b=history.query(trayQuery).items[0];
 assert.equal(a.previewKey,b.previewKey);assert.notEqual(a.token,b.token);assert.equal(operation.valid(),false);assert.throws(()=>history.resolve(a.token));assert.throws(()=>history.resolve(b.previewKey));assert.equal(history.resolve(b.token).id,clip.id);assert.notEqual(b.previewKey,clip.hash);assert.match(b.previewKey,/^[0-9a-f-]{36}$/);assert.equal(b.bytes,clip.bytes);
}));
test('Tray preview identity survives metadata and changes when original content changes',()=>use(store=>{
 const clip=store.add({text:'Original\r\nexact'},'fixture'),history=new TrayHistory(()=>store);history.open();const a=history.query(trayQuery).items[0];store.update(clip.id,{favorite:true,pinned:true});const b=history.query(trayQuery).items[0];assert.equal(b.previewKey,a.previewKey);assert(b.favorite&&b.pinned);store.edit(clip.id,'Changed full body',[]);const c=history.query(trayQuery).items[0];assert.notEqual(c.previewKey,b.previewKey);assert.equal(history.preview(c.token).text,'Changed full body');assert.throws(()=>history.resolve(b.token));
}));
test('Tray preview identity cannot extend an expired ticket or survive closed sessions',()=>use(store=>{
 let now=100;store.add({text:'Expiring'},'fixture');const history=new TrayHistory(()=>store,()=>now);history.open();const a=history.query(trayQuery).items[0];now+=600001;assert.throws(()=>history.resolve(a.token),/过期/);const b=history.query(trayQuery).items[0];assert.equal(b.previewKey,a.previewKey);assert.throws(()=>history.resolve(a.token));history.close();history.open();const c=history.query(trayQuery).items[0];assert.notEqual(c.previewKey,b.previewKey);assert.throws(()=>history.resolve(b.token));
}));
test('Tray identity cache is limited to current rows and forgets filtered or deleted records',()=>use(store=>{
 for(let i=0;i<95;i++)store.add({text:'Row '+i},'fixture',undefined,{updatedAt:100+i},false);const history=new TrayHistory(()=>store);history.open();const a=history.query(trayQuery);assert.equal(a.items.length,80);assert.equal(history.previews.size,80);history.query({...trayQuery,text:'No such private marker'});assert.equal(history.previews.size,0);const b=history.query(trayQuery);assert.notEqual(b.items[0].previewKey,a.items[0].previewKey);store.delete(b.items[0].id);assert(!history.query(trayQuery).items.some(row=>row.id===b.items[0].id));assert.equal(history.previews.size,80);history.close();assert.equal(history.previews.size,0);
}));
