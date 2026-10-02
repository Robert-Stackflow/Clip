import {onRemoval} from './controls';
type Field=HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement;
const fields=(host:HTMLElement)=>Array.from(host.querySelectorAll<Field>('input,textarea,select'));
const snapshot=(host:HTMLElement)=>fields(host).map(node=>({node,value:node.value,checked:node instanceof HTMLInputElement?node.checked:false,shortcut:node.dataset.value}));
/** One's preferences commit independently, coalesce typing and serialize writes. */
export function immediateSettings(host:HTMLElement,save:()=>Promise<void>,error:(value:unknown)=>void){
 let timer:ReturnType<typeof setTimeout>|undefined,pending=false,running=false,revision=0,saved=snapshot(host);
 queueMicrotask(()=>{saved=snapshot(host);});
 const flush=async()=>{clearTimeout(timer);timer=undefined;if(running||!pending||!host.isConnected)return;pending=false;running=true;const version=revision,value=snapshot(host);
  try{await save();saved=value;host.removeAttribute('data-save-error');}catch(e){host.dataset.saveError='true';if(version===revision)for(const item of saved){item.node.value=item.value;if(item.node instanceof HTMLInputElement)item.node.checked=item.checked;if(item.shortcut!==undefined)item.node.dataset.value=item.shortcut;}error(e);}finally{running=false;if(pending&&host.isConnected)void flush();}
 };
 const changed=(event:Event)=>{const node=event.target;if(!(node instanceof HTMLInputElement||node instanceof HTMLTextAreaElement||node instanceof HTMLSelectElement)||!node.checkValidity()||node instanceof HTMLInputElement&&node.readOnly&&event.type==='input')return;revision++;pending=true;clearTimeout(timer);if(event.type==='input'&&!(node instanceof HTMLInputElement&&['checkbox','radio','range'].includes(node.type)))timer=setTimeout(()=>void flush(),250);else void flush();};
 host.addEventListener('input',changed);host.addEventListener('change',changed);host.addEventListener('focusout',()=>{if(pending)void flush();});
 onRemoval(host,()=>{clearTimeout(timer);host.removeEventListener('input',changed);host.removeEventListener('change',changed);});
}
/** A heading introduces a separate card; existing appearance cards keep their own binding. */
export function inlineSettings(host:HTMLElement,toast:(value:unknown)=>void,automatic=false){return {active:()=>host.isConnected,toast:(value:unknown)=>{if(value instanceof Error)toast(value);},modal(_title:string,body:string,save:()=>Promise<void>,_label?:string){
 if(!host.isConnected)return;host.innerHTML='<div class="inline-settings-body">'+body+'</div><span class="inline-error" role="alert" hidden></span>';
 if(!automatic){const container=host.querySelector<HTMLElement>('.desktop-form')||host.querySelector<HTMLElement>('.inline-settings-body')!;let card:HTMLElement|undefined;for(const node of Array.from(container.children)){if(node.matches('h3')||!card){card=document.createElement('section');card.className='settings-card inline-settings-card';node.before(card);}card.append(node);} }
 host.querySelectorAll<HTMLLabelElement>('.desktop-check,.efficiency-toggle').forEach(row=>{const input=row.querySelector('input');if(!input)return;const text=document.createElement('span');text.textContent=row.textContent?.trim()||'';const toggle=document.createElement('span');toggle.className='switch';const indicator=document.createElement('span');indicator.className='switch-track';toggle.append(input,indicator);row.classList.add('inline-check-row');row.replaceChildren(text,toggle);});
 if(!automatic)immediateSettings(host,async()=>{await save();host.querySelector<HTMLElement>('.inline-error')!.hidden=true;},value=>{const error=host.querySelector<HTMLElement>('.inline-error')!;error.hidden=false;error.textContent=value instanceof Error?value.message:String(value);});
 }};}
