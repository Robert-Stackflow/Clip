import {icon} from './ui';
const key=(name:string)=>name.trim().toLowerCase();
const cache=new Map<string,string|null>();const pending=new Set<string>(),expires=new Map<string,number>();
const retries=new WeakMap<HTMLElement,ReturnType<typeof setTimeout>>();
const retryCounts=new WeakMap<HTMLElement,number>();
export const sourceKey=key;
export function appIdentity(name:string){return `<span class="source-icon" data-source-icon="${encodeURIComponent(key(name))}">${cache.get(key(name))?`<img src="${cache.get(key(name))}" alt="" width="16" height="16">`:icon('lucide:app')}</span>`;}
export async function hydrateAppIcons(root:HTMLElement,load=window.clip?.appIcons||window.clipQuick?.appIcons||window.clipTray?.appIcons){
 if(!load)return;const names=[...new Set(Array.from(root.querySelectorAll<HTMLElement>('[data-source-icon]')).map(node=>decodeURIComponent(node.dataset.sourceIcon!)))].filter(name=>(!cache.has(name)||cache.get(name)===null&&(expires.get(name)||0)<Date.now())&&!pending.has(name)).slice(0,64);if(!names.length)return;names.forEach(name=>pending.add(name));
 try{const result=await load(names);for(const [name,value] of Object.entries(result)){cache.delete(name);cache.set(name,value);if(value)expires.delete(name);else expires.set(name,Date.now()+10000);while(cache.size>256){const oldest=cache.keys().next().value!;cache.delete(oldest);expires.delete(oldest);}}for(const node of document.querySelectorAll<HTMLElement>('[data-source-icon]')){const value=cache.get(decodeURIComponent(node.dataset.sourceIcon!));if(value&&!node.querySelector('img')){const image=document.createElement('img');image.src=value;image.alt='';image.width=image.height=16;node.replaceChildren(image);}}if(Object.entries(result).some(([name,value])=>value===null&&/\.exe$/i.test(name))&&!retries.has(root)&&(retryCounts.get(root)||0)<3){retryCounts.set(root,(retryCounts.get(root)||0)+1);retries.set(root,setTimeout(()=>{retries.delete(root);if(root.isConnected)void hydrateAppIcons(root,load);},10050));}}catch{/* Unavailable applications retain a quiet, stable fallback. */}finally{names.forEach(name=>pending.delete(name));}
}
