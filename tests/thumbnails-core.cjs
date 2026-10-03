const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{png,decode}=require('./png-fixture.cjs');
const {Thumbnails}=require('../work/test-thumbnails.cjs'),host=process.env.CLIPPER_IMAGE_HOST||path.resolve('dist/native/ImageHost.exe');

test('JPEG conversion and PNG thumbnails share one bounded decoder without changing original bytes',async()=>{
 const thumbnails=new Thumbnails(host),jpeg=require('./jpeg-fixture.cjs')(),original=Buffer.from(jpeg);
 try{const [full,thumbnail]=await Promise.all([thumbnails.convertJPEG(jpeg),thumbnails.run({png:png(24,18,()=>[40,100,200,128]).toString('base64')})]);const image=decode(Buffer.from(full,'base64'));assert.equal(image.width,2);assert.equal(image.height,2);for(let i=0;i<image.pixels.length;i++)assert(Math.abs(image.pixels[i]-[80,140,210,255][i%4])<=2);assert.deepEqual(jpeg,original);assert(thumbnail.startsWith('data:image/png;base64,'));assert.deepEqual(thumbnails.stats(),{active:0,pending:0,encodedBytes:0});await assert.rejects(()=>thumbnails.convertJPEG(Buffer.alloc(0)));await assert.rejects(()=>thumbnails.convertJPEG(Buffer.alloc(16*1024*1024+1)));await assert.rejects(()=>thumbnails.convertJPEG(Buffer.from([255,216,255,0,0])));assert.deepEqual(thumbnails.stats(),{active:0,pending:0,encodedBytes:0});}finally{await thumbnails.stop();}
});

test('JPEG cancellation retires active and queued jobs and preserves caller buffers',async()=>{
 const thumbnails=new Thumbnails(host),jpeg=require('./jpeg-fixture.cjs')(),original=Buffer.from(jpeg);let live=true;
 const jobs=Array.from({length:4},()=>thumbnails.convertJPEG(jpeg,()=>live));for(const promise of jobs)promise.catch(()=>{});
 await assert.rejects(()=>thumbnails.convertJPEG(jpeg),/正在保存/);live=false;await thumbnails.stop();for(const promise of jobs)await assert.rejects(()=>promise,/取消/);assert.deepEqual(jpeg,original);assert.deepEqual(thumbnails.stats(),{active:0,pending:0,encodedBytes:0});await assert.rejects(()=>thumbnails.convertJPEG(jpeg,()=>false),/取消/);
});
test('native thumbnail bounds size, preserves source and handles straight alpha',async()=>{
 const thumbnails=new Thumbnails(host);try{for(const [width,height,color]of [[2,2,[255,0,0,128]],[3600,3300,[23,170,80,255]],[9000,4200,[30,80,255,255]]]){const bytes=png(width,height,()=>color),payload={png:bytes.toString('base64')},original=payload.png,url=await thumbnails.run(payload),output=decode(Buffer.from(url.split(',')[1],'base64')),scale=Math.min(1,280/width,180/height);assert.equal(output.width,Math.max(1,Math.round(width*scale)));assert.equal(output.height,Math.max(1,Math.round(height*scale)));for(let i=0;i<output.pixels.length;i++)assert(Math.abs(output.pixels[i]-color[i%output.bpp])<=2);assert.equal(payload.png,original);assert.equal(await thumbnails.run(payload),url);assert.deepEqual(thumbnails.stats(),{active:0,pending:0,encodedBytes:0});}}finally{await thumbnails.stop();}
});
test('corrupt PNG, invalid dimensions, missing host and expired task leave no decoder',async()=>{
 const thumbnails=new Thumbnails(host);try{const source=png(1000,1000);await assert.rejects(thumbnails.run({png:source.subarray(0,45).toString('base64')}));const huge=Buffer.from(source);huge.writeUInt32BE(20000,16);await assert.rejects(thumbnails.run({png:huge.toString('base64')}));await assert.rejects(new Thumbnails(path.resolve('work/missing-image-host.exe')).run({png:source.toString('base64')}));const expired=new Thumbnails(host,1);await assert.rejects(expired.run({png:source.toString('base64')}));assert.deepEqual(expired.stats(),{active:0,pending:0,encodedBytes:0});}finally{await thumbnails.stop();}
});
test('queued and active cancellation, bounded jobs and stop wait for native retirement',async()=>{
 const thumbnails=new Thumbnails(host),source=png(8000,4000).toString('base64');let live=true;const pending=Array.from({length:4},()=>thumbnails.run({png:source},()=>live));for(const promise of pending)promise.catch(()=>{});await assert.rejects(thumbnails.run({png:source}),/正在保存/);live=false;await thumbnails.stop();for(const promise of pending)await assert.rejects(promise,/取消/);assert.deepEqual(thumbnails.stats(),{active:0,pending:0,encodedBytes:0});await assert.rejects(thumbnails.run({png:source},()=>false),/取消/);
});
