const {test}=require('node:test'),assert=require('node:assert/strict');
const {markProjection,mapPoint,unmapPoint,findMark,moveMark,hitMark}=require('../work/test-exports.cjs');
const measure=(s,size)=>s.length*size*.6;
test('annotation selection and movement preserve creation coordinates across rotate, flip and crop',()=>{
 const mark={kind:'rect',a:{x:10,y:20},b:{x:60,y:70},color:'#ff0000',width:4},ops=[mark,{kind:'rotate'},{kind:'flip'},{kind:'crop',box:{x:10,y:5,width:80,height:100}}],projection=markProjection(ops,0,200,100);
 assert.deepEqual(projection.size,{width:200,height:100});assert.deepEqual(mapPoint(projection.matrix,{x:15,y:25}),{x:15,y:10});assert.deepEqual(unmapPoint(projection.matrix,{x:15,y:10}),{x:15,y:25});assert.equal(findMark(ops,{x:35,y:5},200,100,3,measure),0);
 const moved=moveMark(mark,7,9);assert.deepEqual(moved.a,{x:17,y:29});assert.deepEqual(mark.a,{x:10,y:20});
});
test('pointer selects topmost actual strokes, text and filled shapes instead of empty bounding boxes',()=>{
 const shape={kind:'rect',a:{x:0,y:0},b:{x:100,y:100},color:'#ff0000',width:2};assert.equal(hitMark(shape,{x:50,y:50},3,measure),false);assert.equal(hitMark({...shape,filled:true},{x:50,y:50},3,measure),true);
 for(const kind of ['ellipse','triangle','diamond','roundrect']){assert.equal(hitMark({...shape,kind,filled:true},{x:50,y:50},1,measure),true);assert.equal(hitMark({...shape,kind,filled:true},{x:-30,y:-30},1,measure),false);}
 const pen={kind:'pen',points:[{x:10,y:10},{x:90,y:90}],color:'#ff0000',width:2};assert.equal(hitMark(pen,{x:50,y:10},2,measure),false);assert.equal(hitMark(pen,{x:45,y:45},2,measure),true);
 const arrow={...shape,kind:'arrow',a:{x:10,y:50},b:{x:90,y:50}};assert.equal(hitMark(arrow,{x:87,y:48},2,measure),true);
 const text={kind:'text',at:{x:20,y:20},text:'A\nBB',color:'#ff0000',width:20};assert.equal(hitMark(text,{x:30,y:60},1,measure),true);assert.equal(hitMark(text,{x:50,y:60},1,measure),false);
 assert.equal(findMark([{...shape,filled:true},text],{x:30,y:40},100,100,1,measure),1);
});
