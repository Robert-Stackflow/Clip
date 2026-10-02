import {icon} from './ui';
const key=(name:string)=>name.trim().toLowerCase();
const cache=new Map<string,string|null>();const pending=new Set<string>(),expires=new Map<string,number>();
export const sourceKey=key;
export function appIdentity(name:string){return `<span class="source-icon" data-source-icon="${encodeURIComponent(key(name))}">${cache.get(key(name))?`<img src="${cache.get(key(name))}" alt="" width="20" height="20">`:icon('lucide:app')}</span>`;}
export async function hydrateAppIcons(root:HTMLElement){
 if(!window.clipper?.appIcons)return;const names=[...new Set(Array.from(root.querySelectorAll<HTMLElement>('[data-source-icon]')).map(node=>decodeURIComponent(node.dataset.sourceIcon!)))].filter(name=>(!cache.has(name)||cache.get(name)===null&&(expires.get(name)||0)<Date.now())&&!pending.has(name)).slice(0,64);if(!names.length)return;names.forEach(name=>pending.add(name));
 try{const result=await window.clipper.appIcons(names);for(const [name,value] of Object.entries(result)){cache.delete(name);cache.set(name,value);if(value)expires.delete(name);else expires.set(name,Date.now()+30000);while(cache.size>256){const oldest=cache.keys().next().value!;cache.delete(oldest);expires.delete(oldest);}}for(const node of document.querySelectorAll<HTMLElement>('[data-source-icon]')){const value=cache.get(decodeURIComponent(node.dataset.sourceIcon!));if(value&&!node.querySelector('img')){const image=document.createElement('img');image.src=value;image.alt='';image.width=image.height=20;node.replaceChildren(image);}}}catch{/* Unavailable applications retain a quiet, stable fallback. */}finally{names.forEach(name=>pending.delete(name));}
}
