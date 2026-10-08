import {createElement,ScanLine,AppWindow,Monitor,type IconNode} from 'lucide';
import {t as tr} from '../shared/i18n';
import type {API,CaptureScreen} from '../shared/types';
import {ActionScope} from './actions';
import {icon} from './ui';
import './capture-tools.css';

type CaptureMode='region'|'window'|'screen';
interface Context {select(id:string):Promise<void>;toast(value:unknown):void}
const glyph=(node:IconNode)=>createElement(node,{class:'icon','aria-hidden':'true','stroke-width':1.75}).outerHTML;
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));

export function captureToolsUI(ctx:Context,api:API=window.clip){
 let tab:'screenshot'|'recording'='screenshot',mode:CaptureMode='region',display=0,request=0,windowToken='';
 let stopLayout:()=>void=()=>{};const actions=new ActionScope();
 function leave(){request++;stopLayout();stopLayout=()=>{};}
 function recording(panel:HTMLElement){
  panel.innerHTML=`<div id="recording-page-host" class="recording-page-host" aria-label="${tr('录屏与录音')}" aria-busy="true"><div class="recording-page-loading" role="status"><span class="source-placeholder" aria-hidden="true"></span><span>${tr('正在加载')}</span></div></div>`;
  const host=panel.querySelector<HTMLElement>('#recording-page-host')!;let stopped=false,frame=0,last='',revision=0;
  const update=()=>{
   frame=0;if(stopped)return;
   const rect=host.getBoundingClientRect(),hidden=!host.isConnected||!!document.querySelector('dialog[open]')||rect.width<1||rect.height<1;
   const bounds=hidden?null:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},key=JSON.stringify(bounds);
   host.toggleAttribute('data-tooltip-occlusion',!!bounds);
   if(key===last)return;last=key;const current=++revision;
   void api.embedRecorder(bounds).then(()=>{if(!stopped&&current===revision&&bounds){host.setAttribute('aria-busy','false');host.replaceChildren();}}).catch(error=>{if(!stopped&&current===revision){host.setAttribute('aria-busy','false');host.textContent=String(error instanceof Error?error.message:error);ctx.toast(error);}});
  };
  const schedule=()=>{if(!frame&&!stopped)frame=requestAnimationFrame(update);};
  const resize=new ResizeObserver(schedule);resize.observe(host);
  const changes=new MutationObserver(schedule);changes.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);schedule();
  stopLayout=()=>{stopped=true;cancelAnimationFrame(frame);resize.disconnect();changes.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);void api.embedRecorder(null).catch(()=>{});};
 }
 function screenshot(panel:HTMLElement){
  const own=++request,modes:[CaptureMode,string,IconNode][]=[['region',tr('区域截图'),ScanLine],['window',tr('窗口截图'),AppWindow],['screen',tr('全屏截图'),Monitor]];
  windowToken='';
  panel.innerHTML=`<section class="capture-settings-card settings-card"><div class="capture-settings-heading"><h2>${tr('截图模式')}</h2><div class="tabs capture-modes" role="group" aria-label="${tr('截图模式')}">${modes.map(([value,label,node])=>`<button type="button" id="capture-${value}" data-capture-mode="${value}" aria-pressed="${value===mode}" class="${value===mode?'active':''}">${glyph(node)}${label}</button>`).join('')}</div></div><div class="capture-source-heading"><h2 id="capture-source-label"></h2><button id="capture-refresh" type="button" class="quiet">${icon('refresh')}${tr('刷新来源')}</button></div><div class="capture-source-list"><div id="capture-displays" class="screen-choices" role="group" aria-labelledby="capture-source-label"></div><div id="capture-window-panel"><div id="capture-windows" class="capture-window-choices" role="group" aria-labelledby="capture-source-label"></div></div></div><p id="capture-error" class="feedback-inline" role="alert"></p><div class="capture-start-row"><button id="take-screenshot" type="button" class="primary">${glyph(ScanLine)}${tr('开始截图')}</button></div></section>`;
  const q=<T extends HTMLElement=HTMLElement>(id:string)=>panel.querySelector<T>('#'+id)!,valid=()=>own===request&&panel.isConnected;
  const start=q<HTMLButtonElement>('take-screenshot'),refresh=q<HTMLButtonElement>('capture-refresh');let screens:CaptureScreen[]=[],listing=0;
  const availability=()=>{start.disabled=mode==='window'?!windowToken:!screens.some(screen=>screen.id===display);};
  async function loadWindows(){
   const current=++listing,node=q('capture-windows');windowToken='';availability();refresh.disabled=true;node.setAttribute('aria-busy','true');node.innerHTML=`<div class="source-placeholder" aria-hidden="true"></div><div class="source-placeholder" aria-hidden="true"></div>`;
   try{const windows=await api.captureWindows();if(!valid()||current!==listing)return;node.replaceChildren();for(const window of windows){const button=document.createElement('button');button.type='button';button.className='capture-window-choice';button.dataset.windowToken=window.token;button.setAttribute('aria-pressed','false');const image=document.createElement('img');image.src=window.thumbnail;image.alt='';const name=document.createElement('span');name.textContent=window.name;button.append(image,name);button.onclick=()=>{windowToken=window.token;node.querySelectorAll('button').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',String(item===button));});availability();};node.append(button);}if(!windows.length)node.innerHTML=`<p class="capture-empty">${tr('没有可用窗口，可打开窗口后刷新')}</p>`;
   }catch(error){if(valid()&&current===listing){node.replaceChildren();q('capture-error').textContent=String(error instanceof Error?error.message:error);}}
   finally{if(valid()&&current===listing){refresh.disabled=false;node.setAttribute('aria-busy','false');}}
  }
  function applyMode(){
   panel.querySelectorAll<HTMLButtonElement>('[data-capture-mode]').forEach(button=>{const active=button.dataset.captureMode===mode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
   q('capture-source-label').textContent=mode==='window'?tr('选择窗口'):tr('选择显示器');q('capture-displays').hidden=mode==='window';q('capture-window-panel').hidden=mode!=='window';refresh.hidden=mode!=='window';q('capture-error').textContent='';availability();
  }
  panel.querySelectorAll<HTMLButtonElement>('[data-capture-mode]').forEach(button=>button.onclick=()=>{if(button.dataset.captureMode===mode)return;mode=button.dataset.captureMode as CaptureMode;listing++;applyMode();if(mode==='window')void loadWindows();});
  refresh.onclick=()=>void loadWindows();
  actions.bind(start,async()=>{const id=mode==='window'?await api.screenshotWindow(windowToken):await api.screenshot(mode,display);if(id){await ctx.select(id);ctx.toast(tr('截图已保存'));}},ctx.toast,'screenshot');
  q('capture-displays').innerHTML=`<div class="source-placeholder" aria-hidden="true"></div>`;applyMode();if(mode==='window')void loadWindows();
  void api.screens().then(values=>{if(!valid())return;screens=values;if(!screens.some(screen=>screen.id===display))display=screens[0]?.id||0;q('capture-displays').innerHTML=screens.map(screen=>`<button type="button" data-screen="${screen.id}" class="${screen.id===display?'active':''}" aria-pressed="${screen.id===display}">${glyph(Monitor)}<strong>${esc(screen.name)}</strong><small>${screen.width} × ${screen.height}</small></button>`).join('');if(!screens.length)q('capture-displays').innerHTML=`<p class="capture-empty">${tr('没有可用来源，可打开窗口后刷新')}</p>`;q('capture-displays').querySelectorAll<HTMLButtonElement>('[data-screen]').forEach(button=>button.onclick=()=>{display=Number(button.dataset.screen);q('capture-displays').querySelectorAll<HTMLButtonElement>('button').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',String(item===button));});availability();});availability();}).catch(error=>{if(valid()){q('capture-displays').replaceChildren();q('capture-error').textContent=String(error instanceof Error?error.message:error);}});
 }
 function render(){
  leave();const root=document.getElementById('content')!;
  // Retain the tab elements for the shared sliding segment indicator.
  if(!root.querySelector('.capture-tools-page'))root.innerHTML=`<section class="tools-page capture-tools-page"><div class="page-heading"><h1>${tr('截图与录制')}</h1></div><div class="capture-tools-toolbar"><div class="tabs" role="tablist" aria-label="${tr('截图与录制')}"><button type="button" id="capture-tab-screenshot" role="tab" data-capture-tab="screenshot" aria-controls="capture-tools-panel">${tr('截图')}</button><button type="button" id="capture-tab-recording" role="tab" data-capture-tab="recording" aria-controls="capture-tools-panel">${tr('录制')}</button></div></div><section id="capture-tools-panel" role="tabpanel" class="capture-tools-panel"></section></section>`;
  const panel=root.querySelector<HTMLElement>('#capture-tools-panel')!;panel.setAttribute('aria-labelledby','capture-tab-'+tab);panel.dataset.captureTab=tab;
  if(tab==='screenshot')screenshot(panel);else recording(panel);
  root.querySelectorAll<HTMLButtonElement>('[data-capture-tab]').forEach(button=>{const active=button.dataset.captureTab===tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.onclick=()=>{const next=button.dataset.captureTab as typeof tab;if(next!==tab){tab=next;render();}};});
 }
 return {render,leave,setTab(value:typeof tab){tab=value;}};
}
