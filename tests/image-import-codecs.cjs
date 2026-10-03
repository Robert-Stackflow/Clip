const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFile}=require('node:child_process'),{promisify}=require('node:util'),{_electron:electron}=require('@playwright/test'),{build}=require('esbuild');
(async()=>{
 const production=process.env.CLIPPER_IMAGE_IMPORT_PRODUCTION==='1';
 const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase(production?'image-import-codecs-production':process.env.CLIPPER_IMAGE_IMPORT_CMYK==='1'?'image-import-codecs-cmyk':'image-import-codecs');try{
  let converter;if(production){converter=path.join(work.fixtures,'production.cjs');await build({stdin:{contents:"export {incomingFiles,cancelTransfers} from './src/main/transfer';export {useThumbnails} from './src/main/clipboard';export {Thumbnails} from './src/main/thumbnails';",resolveDir:process.cwd(),loader:'ts'},outfile:converter,bundle:true,platform:'node',target:'node22',external:['electron','koffi'],define:{__dirname:JSON.stringify(path.resolve('dist/main'))}});}else({converter}=await require('./image-import-prototype.cjs').buildPrototype(work.fixtures));
  const generator=path.join(work.fixtures,'generate.py');await fs.writeFile(generator,`from PIL import Image, ImageCms
from pathlib import Path
import sys, struct, io
p=Path(sys.argv[1]); im=Image.new('RGB',(64,48)); im.putdata([((x*4)%256,(y*5)%256,((x+y)*3)%256) for y in range(48) for x in range(64)])
im.save(p/'rgb.jpg',quality=93)
im.save(p/'progressive.jpg',quality=93,progressive=True)
im.convert('CMYK').save(p/'cmyk.jpg',quality=93)
ink=Image.new('CMYK',(64,48)); ink.putdata([((x*4)%256,(y*5)%256,((x+y)*3)%256,((x*3+y*7)%256)) for y in range(48) for x in range(64)])
ink.save(p/'cmyk-inks.jpg',quality=93)
ink.save(p/'cmyk-progressive.jpg',quality=93,progressive=True)
im.convert('L').save(p/'gray.jpg',quality=93)
im.save(p/'icc-srgb.jpg',quality=93,icc_profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes(),dpi=(300,300))
icc=bytearray(ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes())
for index in range(struct.unpack_from('>I',icc,128)[0]):
 at=132+index*12
 if icc[at:at+4]==b'rXYZ':
  offset=struct.unpack_from('>I',icc,at+4)[0]
  for n in range(3):
   old=struct.unpack_from('>i',icc,offset+8+n*4)[0]; struct.pack_into('>i',icc,offset+8+n*4,round(old*0.8))
icc[84:100]=bytes(16); ImageCms.ImageCmsProfile(io.BytesIO(icc))
im.save(p/'icc-shifted-primary.jpg',quality=93,icc_profile=bytes(icc))
if sys.argv[2]=='production':
 im.save(p/'rgb.bmp'); im.save(p/'rgb.gif'); im.save(p/'rgb.webp')
 rgba=im.convert('RGBA'); rgba.putalpha(Image.frombytes('L',im.size,bytes((x*4)%256 for y in range(48) for x in range(64))))
 rgba.save(p/'alpha.png'); rgba.save(p/'alpha-lossless.webp',lossless=True)
 im.save(p/'animated.gif',save_all=True,append_images=[Image.new('RGB',im.size,'blue')],duration=100,loop=0)
 im.save(p/'animated.webp',save_all=True,append_images=[Image.new('RGB',im.size,'blue')],duration=100,loop=0)
for orientation in range(1,9):
 exif=Image.Exif(); exif[274]=orientation; im.save(p/f'orientation-{orientation}.jpg',quality=93,exif=exif)
print(Image.__version__)
`);const run=promisify(execFile),{stdout:pillowVersion}=await run(process.env.CLIPPER_TEST_PYTHON||'python',[generator,work.fixtures,production?'production':'prototype'],{windowsHide:true});
  const host=path.join(work.fixtures,'host.cjs');await fs.writeFile(host,"const {app}=require('electron');app.setPath('userData',process.argv.at(-1));app.disableHardwareAcceleration();app.on('window-all-closed',()=>{});setInterval(()=>{},1000);");const profile=path.join(work.fixtures,'profile');await fs.mkdir(profile);const env={...process.env,CLIPPER_IMAGE_METRICS:'1'};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({args:[host,profile],env});let rows;try{rows=await app.evaluate(async({nativeImage},{directory,moduleFile,production})=>{const fs=process.getBuiltinModule('node:fs'),path=process.getBuiltinModule('node:path'),assert=process.getBuiltinModule('node:assert/strict'),{createHash}=process.getBuiltinModule('node:crypto'),load=process.getBuiltinModule('node:module').createRequire(moduleFile),api=load(moduleFile),sha=b=>createHash('sha256').update(b).digest('hex'),rows=[];let service;if(production){service=new api.Thumbnails();api.useThumbnails(service);}
   try{for(const name of fs.readdirSync(directory).filter(f=>/\.(jpg|png|gif|bmp|webp)$/.test(f))){const file=path.join(directory,name),raw=fs.readFileSync(file),source=sha(raw),baseline=nativeImage.createFromBuffer(raw),expected=baseline.toBitmap(),size=baseline.getSize();let row={name,size,baselineRejected:baseline.isEmpty(),sourceSHA256:source,baselinePixelSHA256:sha(expected)};try{let png;if(production){const decode=nativeImage.createFromBuffer;let mainDecodes=0;nativeImage.createFromBuffer=(...args)=>{mainDecodes++;return decode(...args);};try{const payload=await api.incomingFiles([file]);png=payload.png;row.originalFormatPreserved=name.endsWith('.png')?png===raw.toString('base64'):payload.formats[0].data===raw.toString('base64');assert(row.originalFormatPreserved);row.mainDecodes=mainDecodes;if(name.endsWith('.jpg'))assert.equal(mainDecodes,0);}finally{nativeImage.createFromBuffer=decode;}}else png=await api.convert(raw);const converted=Buffer.from(png,'base64'),image=nativeImage.createFromBuffer(converted),pixels=image.toBitmap();row.prototypeSize=image.getSize();row.prototypePixelSHA256=sha(pixels);row.sameDimensions=JSON.stringify(size)===JSON.stringify(row.prototypeSize);if(row.sameDimensions&&pixels.length===expected.length){let maxDifference=0,differentChannels=0,totalDifference=0;for(let i=0;i<expected.length;i++){const error=Math.abs(expected[i]-pixels[i]);maxDifference=Math.max(maxDifference,error);if(error)differentChannels++;totalDifference+=error;}Object.assign(row,{maxDifference,differentChannels,meanDifference:totalDifference/expected.length});}converted.fill(0);pixels.fill(0);}catch(error){row.error=String(error);}expected.fill(0);raw.fill(0);row.sourceUnchanged=sha(fs.readFileSync(file))===source;assert(row.sourceUnchanged);rows.push(row);}const invalid=Buffer.from([255,216,255,0,0]);if(production){await assert.rejects(()=>service.convertJPEG(invalid));let live=true;const bytes=fs.readFileSync(path.join(directory,'rgb.jpg')),cancelled=service.convertJPEG(bytes,()=>live);cancelled.catch(()=>{});live=false;await assert.rejects(()=>cancelled);assert.deepEqual(bytes,fs.readFileSync(path.join(directory,'rgb.jpg')));await assert.rejects(()=>api.incomingFiles([path.join(directory,'rgb.jpg')],()=>false));const stopped=api.incomingFiles([path.join(directory,'rgb.jpg')]);stopped.catch(()=>{});api.cancelTransfers();await assert.rejects(()=>stopped);await service.stop();assert.deepEqual(service.stats(),{active:0,pending:0,encodedBytes:0});}else await assert.rejects(()=>api.convert(invalid));return rows;}finally{await service?.stop();}
  },{directory:work.fixtures,moduleFile:converter,production});}finally{await app.close();}
  const matches=row=>row.baselineRejected?row.error==='Error: 图片无法解码':!row.error&&row.sameDimensions&&row.maxDifference===0;
  if(production)assert(rows.every(matches),JSON.stringify(rows.filter(r=>!matches(r))));
  const report={result:'PASS',scope:'Isolated real Electron nativeImage versus WIC JPEG prototype for generated RGB, progressive, CMYK, grayscale, embedded sRGB ICC and EXIF orientations 1–8. Compare every decoded pixel and dimensions, preserve failures and source bytes. This characterizes compatibility rather than asserting that codecs are equivalent. No UI, clipboard or user files.',pillow:pillowVersion.trim(),baseline:'b9c63d1',production,compatible:rows.every(matches),decoded:rows.filter(r=>!r.baselineRejected).length,baselineRejected:rows.filter(r=>r.baselineRejected).map(r=>r.name),rows};await fs.writeFile(path.join(work.output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await work.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
