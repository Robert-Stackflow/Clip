const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(source,load=()=>Promise.resolve()){
 const faces=new Set(),created=[],hosts=[0,1].map(()=>({dataset:{},style:{values:new Map(),setProperty(k,v){this.values.set(k,v);},removeProperty(k){this.values.delete(k);}}}));
 class FontFace{constructor(family,url,descriptors){Object.assign(this,{family,url,descriptors});created.push(this);}load(){return load(this);}}
 class OffscreenCanvas{getContext(){return {measureText:()=>({fontBoundingBoxAscent:10791,fontBoundingBoxDescent:2510})};}}
 const module={exports:{}},context={module,exports:module.exports,window:{clipperAppearance:{uiFontSource:source}},document:{fonts:{add:face=>faces.add(face),delete:face=>faces.delete(face)}},FontFace,OffscreenCanvas};
 vm.runInNewContext(fs.readFileSync('work/test-emoji-font.cjs','utf8'),context);
 return {faces,created,hosts,mount:()=>module.exports.mountEmojiFont(...hosts)};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('emoji font is shared by the page and popup, preserves baseline and is released on exit',async()=>{
 const f=fixture(async family=>{assert.equal(family,'Segoe UI Emoji');return {url:'clipper-font://local/test'};});const dispose=f.mount();await flush();
 assert.equal(f.faces.size,1);assert.equal(f.created[0].descriptors.ascentOverride,'107.91%');assert.equal(f.created[0].descriptors.descentOverride,'25.1%');
 for(const host of f.hosts){assert.equal(host.dataset.emojiFont,'loaded');assert.match(host.style.values.get('--reference-emoji-font'),/Clipper Emoji/);}
 dispose();dispose();assert.equal(f.faces.size,0);for(const host of f.hosts){assert.equal(host.style.values.size,0);assert.equal(host.dataset.emojiFont,undefined);}
});
test('leaving before the source arrives cannot add a font to a later page',async()=>{
 let resolve;const f=fixture(()=>new Promise(done=>resolve=done)),dispose=f.mount();dispose();resolve({url:'clipper-font://local/test'});await flush();assert.equal(f.created.length,0);assert.equal(f.faces.size,0);
});
test('leaving while the font loads cannot retain it or mutate disposed hosts',async()=>{
 let resolve;const f=fixture(async()=>({url:'clipper-font://local/test'}),()=>new Promise(done=>resolve=done)),dispose=f.mount();await flush();dispose();resolve();await flush();assert.equal(f.faces.size,0);assert.ok(f.hosts.every(host=>host.style.values.size===0&&host.dataset.emojiFont===undefined));
});
test('missing file sources keep the installed native font available',async()=>{
 const f=fixture(async()=>({local:['Segoe UI Emoji']}));f.mount();await flush();assert.equal(f.created.length,0);assert.ok(f.hosts.every(host=>host.style.values.size===0));
});
test('a rejected source or font gracefully keeps native rendering',async()=>{
 for(const f of [fixture(async()=>{throw Error('source unavailable');}),fixture(async()=>({url:'clipper-font://local/test'}),()=>Promise.reject(Error('font unavailable')))]){f.mount();await flush();assert.equal(f.faces.size,0);assert.ok(f.hosts.every(host=>host.dataset.emojiFont==='fallback'&&host.style.values.size===0));}
});
