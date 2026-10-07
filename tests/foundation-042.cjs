const {chromium}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup}=require('./renderer-fixture.cjs'),{extra}=require('./ui-028-fixture.cjs');
const markup=`<aside id="foundation" style="position:fixed;inset:60px 20px 20px auto;width:420px;overflow:auto;padding:18px;background:var(--surface);z-index:5;display:flex;flex-direction:column;gap:12px">
<button id="base-button">Action</button><button id="base-primary" class="primary">Save</button><button id="base-quiet" class="quiet">More</button><button id="base-icon" class="icon-button quiet" aria-label="More">+</button>
<input id="base-input" placeholder="Name"><textarea id="base-textarea">Text</textarea><input id="base-checkbox" type="checkbox" checked>
<label class="switch"><input id="base-switch" type="checkbox" checked><span class="switch-track"></span></label>
<span class="number-control"><input id="base-number" type="number" value="10"><button>−</button><button>+</button></span>
<span class="shortcut-control"><input id="base-shortcut" readonly value="Ctrl + Shift + V"></span><input id="base-range" type="range" value="50">
<button id="base-select" class="custom-select"><span>Option</span></button><div class="tabs"><button id="base-tab" class="selected">Tab</button><button>Other</button></div>
<button class="theme-choice" aria-pressed="true"><span id="base-theme" class="theme-mini"><i></i><b></b><em></em></span><span>Light</span></button>
<span id="base-color" class="color-field"><i style="--swatch:#4479d8"></i><input value="#4479d8"></span>
<section id="base-card" class="settings-card"><div id="base-row" class="setting-row"><div class="setting-copy"><strong>Name</strong><p>Required detail</p></div><button>Change</button></div></section>
<nav class="settings-nav"><button id="base-nav" class="quiet active">Appearance</button></nav></aside>`;
const names=['button','primary','quiet','icon','input','textarea','checkbox','switch','number','shortcut','range','select','tab','theme','color','card','row','nav'];
const props=['backgroundColor','color','borderTopWidth','borderTopColor','borderTopLeftRadius','paddingLeft','paddingRight','paddingTop','paddingBottom','fontSize','lineHeight','opacity','minHeight','boxShadow'];
(async()=>{await fs.mkdir('work/foundation-042',{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true}),results=[];try{
const css=(await fs.readFile('tests/fixtures/one-041/src/renderer/styles.css','utf8'))+(await fs.readFile('tests/fixtures/one-041/src/renderer/components.css','utf8'));
const controller=(await require('esbuild').build({stdin:{contents:"import {setupSegments} from './tests/fixtures/one-041/src/renderer/segments.ts';setupSegments();",resolveDir:process.cwd()},bundle:true,write:false,platform:'browser'})).outputFiles[0].text;
for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width:1240,height:800},reducedMotion:'reduce'});for(const fn of [setup,extra])await context.addInitScript(fn);await context.addInitScript(theme=>fixture.state.dark=theme==='dark',theme);
 const requested=[];await context.route('https://clipper.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(name.endsWith('.css'))requested.push(name);await route.fulfill({body:await fs.readFile(path.join('dist/renderer',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript'});});
 const actual=await context.newPage();await actual.goto('https://clipper.test/index.html');await actual.waitForSelector('#copy');await actual.evaluate(markup=>document.body.insertAdjacentHTML('beforeend',markup),markup);
 assert.deepEqual(requested.sort(),['app.css','one-ui.css']);assert.equal(await actual.locator('link[href="one-ui.css"]').count(),1);
 const reference=await context.newPage();await reference.setContent(`<html data-theme="${theme}"><head><style>${css}</style><style>:root[data-theme=dark]{--surface:#181818;--fg:#eee;--accent:#e4e4e4;--on-accent:#141414}</style></head><body><div id="app">${markup}</div></body></html>`);await reference.addScriptTag({content:controller});
 for(const [label,page]of [['actual',actual],['reference',reference]]){console.log('Foundation '+theme+' '+label,await page.locator('#base-tab').evaluate(e=>({parent:e.parentElement.className,background:getComputedStyle(e).backgroundColor})));await page.waitForFunction(()=>document.querySelector('#foundation .segment-ready')&&getComputedStyle(document.getElementById('base-tab')).backgroundColor==='rgba(0, 0, 0, 0)',null,{timeout:10000});}
 for(const name of names)for(const state of ['idle','hover','focus','disabled']){console.log(theme,name,state);
  for(const page of [actual,reference]){await page.evaluate(()=>{document.activeElement?.blur();document.querySelectorAll('#foundation button,#foundation input,#foundation textarea').forEach(e=>e.disabled=false);});await page.mouse.move(1,1);if(state==='hover')await page.locator('#base-'+name).hover({timeout:5000});if(state==='focus')await page.locator('#base-'+name).evaluate(e=>e.focus());if(state==='disabled')await page.locator('#base-'+name).evaluate(e=>{if('disabled'in e)e.disabled=true;});}
  const read=(e,props)=>{const s=getComputedStyle(e);return Object.fromEntries(props.map(k=>[k,s[k]]));};const a=await actual.locator('#base-'+name).evaluate(read,props),b=await reference.locator('#base-'+name).evaluate(read,props);assert.deepEqual(a,b,theme+' '+name+' '+state);results.push({theme,name,state});
 }
 await actual.screenshot({path:'work/foundation-042/'+theme+'.png'});await context.close();
}
const entries=['index','tray','shelf','image-editor','recorder','selection','unlock','recovery','capture'];
for(const name of entries){const html=await fs.readFile('dist/renderer/'+name+'.html','utf8');assert.equal((html.match(/href="one-ui.css"/g)||[]).length,1,name);assert.equal((html.match(/<link rel="stylesheet"/g)||[]).length,2,name);}
await fs.writeFile('work/foundation-042/results.json',JSON.stringify({passed:true,version:'0.42.0',referenceVersion:JSON.parse(await fs.readFile('tests/fixtures/one-041/package.json')).version,cases:results.length,components:names,desktopEntries:entries,oneSharedStylesheet:true,systemClipboard:false,desktopInput:false,results},null,2));console.log(JSON.stringify({passed:true,cases:results.length,components:names.length,desktopEntries:entries.length}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
