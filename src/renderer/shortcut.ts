import {t as tr} from '../shared/i18n';
import {shortcutFromEvent,shortcutLabel} from '../shared/shortcut';
import {onRemoval} from './controls';
import {icon} from './ui';

// Focus can move between fields before an IPC response arrives. Keep pause/resume ordered.
let operations=Promise.resolve();
function record(active:boolean){operations=operations.catch(()=>{}).then(()=>window.clipper.recordShortcut(active));return operations;}
const feedback=new WeakMap<HTMLInputElement,(error?:unknown,retry?:()=>void|Promise<void>)=>void>();
/** Keep save and registration failures next to the field that caused them. */
export function shortcutFeedback(input:HTMLInputElement,error?:unknown,retry?:()=>void|Promise<void>){const show=feedback.get(input);if(!show)return false;show(error,retry);return true;}
export function isShortcutError(error:unknown){return /快捷键|shortcut/i.test(String(error instanceof Error?error.message:error));}

/** Release our global bindings while recording, then commit after the main key is released. */
export function setupShortcut(input:HTMLInputElement,report:(error:unknown)=>void,optional=true){
 if(input.dataset.shortcutControl)return;input.dataset.shortcutControl='true';
 input.readOnly=true;input.classList.add('shortcut-input');
 const placeholder=tr(optional?'点击录入，Delete 清除':'点击后按下新的快捷键');input.placeholder=placeholder;input.value=shortcutLabel(input.dataset.value||'');
 const events=new AbortController(),listen={signal:events.signal};let recording=false,ready=false,pending:string|undefined,pendingCode='',session=0;
 const field=document.createElement('span');field.className='shortcut-field';
 const existing=input.parentElement?.classList.contains('shortcut-control')?input.parentElement:null;
 const wrapper=existing||document.createElement('span');wrapper.className='shortcut-control';(existing||input).before(field);field.append(wrapper);if(!existing)wrapper.append(input);
 const notice=document.createElement('span');notice.className='shortcut-notice';notice.hidden=true;notice.setAttribute('role','alert');
 const message=document.createElement('span');message.id=(input.id||'shortcut-'+crypto.randomUUID())+'-message';
 const retryButton=document.createElement('button');retryButton.type='button';retryButton.textContent=tr('重试');
 notice.innerHTML=icon('lucide:info');notice.append(message,retryButton);field.append(notice);
 const description=input.getAttribute('aria-describedby');let retryAction:(()=>void|Promise<void>)|undefined;
 feedback.set(input,(error,retry)=>{
  notice.hidden=error===undefined;retryAction=retry;retryButton.hidden=!retry;retryButton.disabled=false;
  message.textContent=error===undefined?'':String(error instanceof Error?error.message:error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');
  if(error!==undefined){input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',[description,message.id].filter(Boolean).join(' '));}
  else{input.removeAttribute('aria-invalid');if(description)input.setAttribute('aria-describedby',description);else input.removeAttribute('aria-describedby');}
 });
 retryButton.addEventListener('click',()=>{if(!retryAction||retryButton.disabled)return;retryButton.disabled=true;void Promise.resolve().then(retryAction).catch(error=>shortcutFeedback(input,error,retryAction)).finally(()=>{retryButton.disabled=false;});},listen);
 const fail=(error:unknown)=>{if(!input.isConnected){report(error);return;}shortcutFeedback(input,error,()=>{input.focus();begin();});};
 const finish=(commit=false)=>{
  if(!recording)return;recording=false;ready=false;input.dataset.shortcutReady='false';input.classList.remove('recording');input.placeholder=placeholder;
  const value=pending,version=session;pending=undefined;pendingCode='';input.value=shortcutLabel(input.dataset.value||'');
  void record(false).then(()=>{
   if(!commit||value===undefined||!input.isConnected||session!==version)return;
   input.dataset.value=value;input.value=shortcutLabel(value);input.dispatchEvent(new Event('change',{bubbles:true}));
  }).catch(fail);
 };
 const begin=()=>{
  if(recording)return;shortcutFeedback(input);recording=true;ready=false;input.dataset.shortcutReady='false';const version=++session;pending=undefined;pendingCode='';input.classList.add('recording');input.value=tr('正在准备…');
  void record(true).then(()=>{if(!recording||version!==session)return;ready=true;input.dataset.shortcutReady='true';if(pending===undefined)input.value=tr('按下组合键…');}).catch(error=>{finish();input.blur();fail(error);});
 };
 input.addEventListener('focus',begin,listen);input.addEventListener('blur',()=>finish(),listen);
 input.addEventListener('pointerdown',()=>{if(document.activeElement===input)begin();},listen);
 window.addEventListener('blur',()=>finish(),listen);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)finish();},listen);
 input.addEventListener('keydown',event=>{
  if(!recording)return;
  const modified=event.ctrlKey||event.altKey||event.shiftKey||event.metaKey;
  if(event.key==='Tab'&&!modified)return;
  event.preventDefault();event.stopPropagation();if(event.repeat)return;
  if(event.key==='Escape'&&!modified){pending=undefined;finish();input.blur();return;}
  if(!ready)return;
  if(['Control','Alt','Shift','Meta','OS'].includes(event.key))return;
  const value=!modified&&['Delete','Backspace'].includes(event.key)&&optional?'':shortcutFromEvent(event);
  if(value===undefined){input.value=tr('至少一个修饰键');return;}
  pending=value;pendingCode=event.code;input.value=shortcutLabel(value);
 },listen);
 input.addEventListener('keyup',event=>{
  if(!recording||pending===undefined||event.code!==pendingCode)return;
  event.preventDefault();event.stopPropagation();finish(true);input.blur();
 },listen);
 const disposeNative=window.clipper.onShortcutInput?.(value=>{
  if(!recording||document.activeElement!==input)return;
  ready=true;input.dataset.shortcutReady='true';
  input.dispatchEvent(new KeyboardEvent(value.type==='keyDown'?'keydown':'keyup',{key:value.key,code:value.code,ctrlKey:value.control,altKey:value.alt,shiftKey:value.shift,metaKey:value.meta,bubbles:true,cancelable:true}));
 });
 if(optional){const clear=document.createElement('button');clear.type='button';clear.className='icon-button quiet';clear.title=tr('清除快捷键');clear.setAttribute('aria-label',tr('清除快捷键'));clear.innerHTML=icon('close');clear.addEventListener('click',()=>{finish();shortcutFeedback(input);input.dataset.value='';input.value='';input.dispatchEvent(new Event('change',{bubbles:true}));},listen);wrapper.append(clear);}
 input.closest('dialog')?.addEventListener('close',()=>finish(),listen);
 onRemoval(field,()=>{finish();events.abort();disposeNative?.();feedback.delete(input);});
}
