const {test}=require('node:test'),assert=require('node:assert/strict');
const {enabledOption,focusOption,revealOption}=require('../work/test-option-list.cjs');
test('One option navigation respects disabled entries and list boundaries',()=>{
 const options=[{disabled:true},{},{disabled:true},{},{disabled:true}];
 for(const [at,direction,next]of [[0,1,1],[4,-1,3],[2,1,3],[2,-1,1],[5,1,-1],[-1,-1,-1]])assert.equal(enabledOption(options,at,direction),next);
 assert.equal(enabledOption([{disabled:true}],0,1),-1);assert.equal(enabledOption([],0,1),-1);
});
test('One focus changes touch only previous and next rows, and repeated focus is inert',()=>{
 const edits=[],node=id=>({classList:{add:name=>edits.push([id,'add',name]),remove:name=>edits.push([id,'remove',name])}}),a=node('a'),b=node('b');
 assert.equal(focusOption(a,b),b);assert.deepEqual(edits,[['a','remove','focused'],['b','add','focused']]);
 edits.length=0;assert.equal(focusOption(b,b),b);assert.deepEqual(edits,[]);assert.equal(focusOption(b,null),null);assert.deepEqual(edits,[['b','remove','focused']]);
});
test('One reveal only adjusts its own list, leaving visible options untouched',()=>{
 const list={scrollTop:100,clientHeight:200};revealOption(list,{offsetTop:130,offsetHeight:30});assert.equal(list.scrollTop,100);
 revealOption(list,{offsetTop:50,offsetHeight:30});assert.equal(list.scrollTop,50);revealOption(list,{offsetTop:300,offsetHeight:40});assert.equal(list.scrollTop,140);
});
