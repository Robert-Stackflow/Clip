const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFile}=require('node:child_process'),{promisify}=require('node:util'),{_electron:electron}=require('@playwright/test');
(async()=>{
 const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('image-import-codecs');try{
  const {converter}=await require('./image-import-prototype.cjs').buildPrototype(work.fixtures);
  const generator=path.join(work.fixtures,'generate.py');await fs.writeFile(generator,`from PIL import Image, ImageCms
from pathlib import Path
import sys
p=Path(sys.argv[1]); im=Image.new('RGB',(64,48)); im.putdata([((x*4)%256,(y*5)%256,((x+y)*3)%256) for y in range(48) for x in range(64)])
im.save(p/'rgb.jpg',quality=93)
im.save(p/'progressive.jpg',quality=93,progressive=True)
im.convert('CMYK').save(p/'cmyk.jpg',quality=93)
im.convert('L').save(p/'gray.jpg',quality=93)
im.save(p/'icc-srgb.jpg',quality=93,icc_profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes(),dpi=(300,300))
for orientation in range(1,9):
 exif=Image.Exif(); exif[274]=orientation; im.save(p/f'orientation-{orientation}.jpg',quality=93,exif=exif)
print(Image.__version__)
`);const run=promisify(execFile),{stdout:pillowVersion}=await run(process.env.CLIPPER_TEST_PYTHON||'python',[generator,work.fixtures],{windowsHide:true});
  const host=path.join(work.fixtures,'host.cjs');await fs.writeFile(host,"const {app}=require('electron');app.setPath('userData',process.argv.at(-1));app.disableHardwareAcceleration();app.on('window-all-closed',()=>{});setInterval(()=>{},1000);");const profile=path.join(work.fixtures,'profile');await fs.mkdir(profile);const env={...process.env,CLIPPER_IMAGE_METRICS:'1'};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({args:[host,profile],env});let rows;try{rows=await app.evaluate(async({nativeImage},{directory,moduleFile})=>{const fs=process.getBuiltinModule('node:fs'),path=process.getBuiltinModule('node:path'),assert=process.getBuiltinModule('node:assert/strict'),{createHash}=process.getBuiltinModule('node:crypto'),load=process.getBuiltinModule('node:module').createRequire(moduleFile),{convert}=load(moduleFile),sha=b=>createHash('sha256').update(b).digest('hex'),rows=[];
   for(const name of fs.readdirSync(directory).filter(f=>f.endsWith('.jpg'))){const file=path.join(directory,name),raw=fs.readFileSync(file),source=sha(raw),baseline=nativeImage.createFromBuffer(raw),expected=baseline.toBitmap(),size=baseline.getSize();let row={name,size,sourceSHA256:source,baselinePixelSHA256:sha(expected)};try{const converted=Buffer.from(await convert(raw),'base64'),image=nativeImage.createFromBuffer(converted),pixels=image.toBitmap();row.prototypeSize=image.getSize();row.prototypePixelSHA256=sha(pixels);row.sameDimensions=JSON.stringify(size)===JSON.stringify(row.prototypeSize);if(row.sameDimensions&&pixels.length===expected.length){let maxDifference=0,differentChannels=0,totalDifference=0;for(let i=0;i<expected.length;i++){const error=Math.abs(expected[i]-pixels[i]);maxDifference=Math.max(maxDifference,error);if(error)differentChannels++;totalDifference+=error;}Object.assign(row,{maxDifference,differentChannels,meanDifference:totalDifference/expected.length});}converted.fill(0);pixels.fill(0);}catch(error){row.error=String(error);}expected.fill(0);raw.fill(0);row.sourceUnchanged=sha(fs.readFileSync(file))===source;assert(row.sourceUnchanged);rows.push(row);}const invalid=Buffer.from([255,216,255,0,0]);await assert.rejects(()=>convert(invalid));return rows;
  },{directory:work.fixtures,moduleFile:converter});}finally{await app.close();}
  const report={result:'PASS',scope:'Isolated real Electron nativeImage versus WIC JPEG prototype for generated RGB, progressive, CMYK, grayscale, embedded sRGB ICC and EXIF orientations 1–8. Compare every decoded pixel and dimensions, preserve failures and source bytes. This characterizes compatibility rather than asserting that codecs are equivalent. No UI, clipboard or user files.',pillow:pillowVersion.trim(),baseline:'b9c63d1',compatible:rows.every(r=>r.sameDimensions&&r.maxDifference===0),rows};await fs.writeFile(path.join(work.output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await work.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
