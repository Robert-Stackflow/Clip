const {test}=require('node:test'),assert=require('node:assert/strict'),{collectionItems}=require('../work/test-collection.cjs');
const a={id:'a',kind:'text',favorite:false},b={id:'b',kind:'image',favorite:true},c={id:'c',kind:'text',favorite:true},clips=[a,b,c],map=new Map(clips.map(c=>[c.id,c]));
test('Filtered duplicate stack entries keep their original slots',()=>{
 const result=collectionItems(clips,map,'stack',['a','missing','b','a','c'],[],'text',new Set(['a']));assert.deepEqual(result.items,[a,a]);assert.deepEqual(result.indices,[0,3]);
});
test('Collections preserve their order and combine kind, favorite and search filters',()=>{
 assert.deepEqual(collectionItems(clips,map,'favorites',[],[],'text',null).items,[c]);
 assert.deepEqual(collectionItems(clips,map,'shelf',[],['c','missing','a','b'],'all',new Set(['a','c'])),{items:[c,a],indices:[]});
 assert.deepEqual(collectionItems(clips,map,'category:x',[],[],'all',new Set(['a','b'])).items,[a,b]);
});
test('Stack filtering performs one membership lookup per slot on a large queue',()=>{
 const count=30000,queue=Array.from({length:count},(_,i)=>i%2?'b':'a');let reads=0;const lookup={get:id=>{reads++;return map.get(id);}};
 const result=collectionItems(clips,lookup,'stack',queue,[],'text',null);assert.equal(reads,count);assert.equal(result.items.length,count/2);assert.equal(result.indices.at(-1),count-2);
});
test('History excludes shelf membership through search/type/source filters; moving out restores it',()=>{
 const records=clips.map(c=>({...c,source:'Fixture.exe'})),lookup=new Map(records.map(c=>[c.id,c]));
 assert.deepEqual(collectionItems(records,lookup,'history',[],['b','c','missing'],'all',null).items,[records[0]]);
 assert.deepEqual(collectionItems(records,lookup,'history',[],['c'],'text',new Set(['c']),'fixture.exe').items,[]);
 assert.deepEqual(collectionItems(records,lookup,'category:x',[],['c'],'all',new Set(['c'])).items,[records[2]]);
 assert.deepEqual(collectionItems(records,lookup,'history',[],[],'text',new Set(['c']),'fixture.exe').items,[records[2]]);
});

test('Source filtering combines favorites, kind and search while preserving duplicate slot identity',()=>{const records=[{...a,source:'Code.exe'},{...b,source:'Snipaste.exe'},{...c,source:'CODE.exe'}],lookup=new Map(records.map(item=>[item.id,item]));assert.deepEqual(collectionItems(records,lookup,'history',[],[],'text',new Set(['c']),'code.exe').items,[records[2]]);assert.deepEqual(collectionItems(records,lookup,'favorites',[],[],'all',null,'code.exe').items,[records[2]]);assert.deepEqual(collectionItems(records,lookup,'stack',['a','b','a','c'],[],'all',null,'code.exe').indices,[0,2,3]);assert.deepEqual(collectionItems(records,lookup,'shelf',[],['a','b'],'all',null,'snipaste.exe').items,[records[1]]);});
