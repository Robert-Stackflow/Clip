const {test}=require('node:test'),assert=require('node:assert/strict');
const {ScrollSampler,scrollControlBounds,rectanglesOverlap}=require('../work/test-exports.cjs');
const frame=n=>({width:80,height:80,data:Buffer.alloc(80*80*4,n)});
test('Automatic scroll waits for a stationary changed frame; duplicate, movement and resume do not append',()=>{
 const sampler=new ScrollSampler();sampler.reset(frame(0));assert.equal(sampler.observe(frame(0)),false);assert.equal(sampler.observe(frame(50)),false);assert.equal(sampler.observe(frame(100)),false);assert.equal(sampler.observe(frame(100)),true);sampler.accept(frame(100));assert.equal(sampler.observe(frame(100)),false);assert.equal(sampler.observe(frame(50)),false);sampler.reset(frame(100));assert.equal(sampler.observe(frame(50)),false);assert.equal(sampler.observe(frame(50)),true);
});
test('Scroll controls fit outside capture, including negative/secondary displays; no invalid fallback overlays capture',()=>{
 const areas=[{x:0,y:0,width:1920,height:1040},{x:-1280,y:-120,width:1280,height:900}],size={width:420,height:260};
 for(const r of [{x:80,y:50,width:900,height:800},{x:0,y:0,width:1920,height:1040},{x:-1180,y:-50,width:600,height:600}]){const bounds=scrollControlBounds(r,areas,size);assert(bounds);assert.equal(rectanglesOverlap(r,bounds),false);assert(areas.some(a=>bounds.x>=a.x&&bounds.y>=a.y&&bounds.x+bounds.width<=a.x+a.width&&bounds.y+bounds.height<=a.y+a.height));}
 assert.equal(scrollControlBounds(areas[0],[areas[0]],size),undefined);
});
