const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {Store,HistorySearch,matchesCategory,validateCategory}=require('../work/test-exports.cjs');
const catalog=require('../src/shared/category-icons.json'),lucide=require('lucide');
test('the category catalog exposes every canonical icon in the installed Lucide version',()=>{
 const exports=require('node:fs').readFileSync('node_modules/lucide/dist/esm/iconsAndAliases.mjs','utf8');
 const expected=new Set([...exports.matchAll(/from '\.\/icons\/([^']+)\.mjs'/g)].map(match=>match[1]));
 assert.equal(Object.keys(catalog).length,expected.size);
 for(const [name,exported]of Object.entries(catalog)){assert(expected.has(name));assert(Array.isArray(lucide.icons[exported]),name);assert.equal(validateCategory({name:'Icon',icon:name,color:'#123abc',kind:'text',contains:'',source:'',tag:''}).icon,name);}
});
test('category counts match full search rules, include subcategories once and follow mutations for plaintext and encrypted history',async()=>{
 for(const encrypted of[false,true]){
  await fs.mkdir('work/development',{recursive:true});const dir=await fs.mkdtemp(path.resolve('work/development/category-counts-')),key=encrypted?Buffer.alloc(32,53):undefined,store=new Store(path.join(dir,'history.sqlite'),false,false,key),search=new HistorySearch(path.resolve('work/test-search-worker.cjs')),counter=new HistorySearch(path.resolve('work/test-search-worker.cjs'));
  try{
   const rule={color:'#123abc',kind:'text',contains:'',source:'',tag:''};
   const parent=store.saveCategory({...rule,name:'Parent',icon:'alarm-clock-check',contains:'TAIL',allowChildren:true}),child=store.saveCategory({...rule,name:'Child',contains:'child',parentId:parent}),favorite=store.saveCategory({...rule,name:'Favorites',favorite:true}),pinned=store.saveCategory({...rule,name:'Pinned',pinned:true}),manual=store.saveCategory({...rule,name:'Manual',manual:true});
   const first=store.add({text:'long content '.repeat(1000)+'TAIL child'},'Editor.exe',undefined,{favorite:true,pinned:true});store.add({text:'child only'},'Editor.exe');store.add({text:'unrelated'},'Other.exe');store.setManualCategory([first.id],manual,true);
   const count=()=>counter.counts(2,path.join(dir,'history.sqlite'),store.categories,key&&Buffer.from(key),()=>true);
   const verify=async()=>{const counts=await count(),items=store.all();for(const category of store.categories){const group=[category,...store.categories.filter(c=>c.parentId===category.id)],expected=items.filter(item=>group.some(c=>matchesCategory(item,c))).map(item=>item.id);assert.equal(counts[category.id],expected.length,category.name);assert.deepEqual(new Set(await search.run(1,path.join(dir,'history.sqlite'),'',group,key&&Buffer.from(key),()=>true)),new Set(expected));}return counts;};
   const before=await verify();assert.equal(before[parent],2);assert.equal(before[child],2);assert.equal(before[favorite],1);assert.equal(before[manual],1);
   store.update(first.id,{favorite:false,pinned:false});const updated=await verify();assert.equal(updated[favorite],0);assert.equal(updated[pinned],0);
   store.batch([first.id],'delete');assert.equal((await verify())[manual],0);store.undo();assert.equal((await verify())[manual],1);
   const pending=counter.counts(7,path.join(dir,'history.sqlite'),store.categories,key&&Buffer.from(key),()=>true);await counter.cancel(7);assert.deepEqual(await pending,{});
  }finally{await search.cancel();await counter.cancel();store.close();key?.fill(0);}
 }
});
