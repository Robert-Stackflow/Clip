const fs=require('node:fs/promises'),path=require('node:path');
function setupWeb(config={}){
 const key='clip.web.language.v1';
 if(config.saved&&!localStorage.getItem(key))localStorage.setItem(key,config.saved);
 if(config.denied)Object.defineProperty(window,'localStorage',{get(){throw new DOMException('fixture denied','SecurityError');}});
 let browserLanguage=config.browserLanguage||navigator.language;
 Object.defineProperty(navigator,'languages',{get:()=>[browserLanguage]});Object.defineProperty(navigator,'language',{get:()=>browserLanguage});
 const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;const drawing=canvas.getContext('2d');drawing.fillStyle='#e7eee7';drawing.fillRect(0,0,160,90);drawing.fillStyle='#326bdf';drawing.fillRect(16,16,128,58);const png=canvas.toDataURL('image/png').split(',')[1];
 const bytes=Uint8Array.from(atob(png),c=>c.charCodeAt(0)),text='保存 Settings <img id="injected-body"> {{姓名}} ⟦0⟧\n第二行';
 const state={approved:config.approved!==false,name:'保存 设置 <img id="injected-name">',code:'123456',allowSend:config.allowSend!==false,expires:Date.now()+300000,revision:1,items:[{id:'text',title:'保存 <img id="injected-title">',preview:text,image:false,bytes:text.length},{id:'image',title:'图片原名 保存',preview:'HOST IMAGE LABEL MUST NOT LEAK',image:true,bytes:bytes.length}]};
 let stream,blocked,release;const calls=[],copies=[],failures={};
 const response=(body,status=200,type='application/json')=>new Response(type==='application/json'?JSON.stringify(body):body,{status,headers:{'Content-Type':type}});
 window.fixture={state,calls,copies,png,text,failures,block:path=>{blocked=path;},release:()=>{blocked=undefined;release?.();release=undefined;},event:type=>stream?.enqueue(new TextEncoder().encode('event: '+type+'\ndata: {}\n\n')),setBrowserLanguage:value=>{browserLanguage=value;dispatchEvent(new Event('languagechange'));},breakStream:()=>{stream?.close();stream=undefined;}};
 Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{copies.push({text:value});},write:async items=>{copies.push({png:await(await items[0].getType('image/png')).size});}}});
 const originalFetch=window.fetch;
 window.fetch=async(input,options={})=>{
  const route=String(input);if(!route.startsWith('/api/'))return originalFetch(input,options);
  calls.push({route,body:options.body?JSON.parse(options.body):undefined,headers:Object.fromEntries(new Headers(options.headers)),credentials:options.credentials});
  if(blocked===route)await new Promise(resolve=>{release=resolve;});
  if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');
  const failure=failures[route]?.shift();if(failure)return response(failure.body,failure.status);
  if(route==='/api/connect'){state.name=JSON.parse(options.body).name;return response({token:'fixture-token-only',code:state.code});}
  if(route==='/api/state')return response(state);
  if(route==='/api/events')return new Response(new ReadableStream({start(controller){stream=controller;options.signal?.addEventListener('abort',()=>{try{controller.error(new DOMException('Aborted','AbortError'));}catch{}},{once:true});}}),{headers:{'Content-Type':'text/event-stream'}});
  if(route==='/api/item/text')return response({text});
  if(route==='/api/item/image')return response(bytes,200,'image/png');
  if(route==='/api/send')return response({ok:true});
  throw Error('Unrecognized fixture route '+route);
 };
}
async function createContext(browser,config={}){
 const context=await browser.newContext({viewport:{width:1000,height:760},locale:config.locale||'en-US',colorScheme:config.colorScheme||'light'});
 await context.addInitScript(setupWeb,config);
 await context.route('https://clip-web.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1)||'index.html';if(!['index.html','app.js','app.css'].includes(name))return route.abort();await route.fulfill({body:await fs.readFile(path.join('dist/web',name)),contentType:name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css':'text/javascript',headers:{'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});});return context;
}
async function start(page,invite=true){await page.goto('https://clip-web.test/'+(invite?'#clip-web=fixture-invitation-only':''));await page.waitForFunction(()=>!!document.getElementById('connect-form').onsubmit);}
async function join(page){await page.locator('#name').fill('保存 设置 <img id="injected-name">');await page.locator('#verified').check();await page.locator('#connect').click();await page.waitForFunction(()=>!document.getElementById('workspace').hidden||!document.getElementById('waiting').hidden);}
module.exports={createContext,start,join};
