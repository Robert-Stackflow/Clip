import {createElement,ChevronDown,Check,Minus,Plus,Search,X,Image,RefreshCw,type IconNode} from 'lucide';
export const q=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const icons:Record<string,IconNode>={image:Image,close:X,'chevron-down':ChevronDown,check:Check,minus:Minus,plus:Plus,search:Search,refresh:RefreshCw,'refresh-cw':RefreshCw};
const cache=new Map<string,string>();
/** One ui.ts icon and registration API; memoization avoids rebuilding hot list icons. */
export function registerIcons(catalog:Record<string,IconNode>){for(const [name,node]of Object.entries(catalog)){icons['lucide:'+name]=node;cache.delete('lucide:'+name);}}
export function icon(name:string){let value=cache.get(name);if(!value){value=createElement(icons[name]||Search,{'class':'icon lucide','aria-hidden':'true','focusable':'false','data-lucide-icon':name,'stroke-width':1.75}).outerHTML;cache.set(name,value);}return value;}

document.documentElement.style.setProperty('--check-icon',`url("data:image/svg+xml,${encodeURIComponent(icon('check'))}")`);
export const api={installedFonts:(refresh=false)=>window.clipperAppearance!.installedFonts(refresh),uiFontSource:(family:string)=>window.clipperAppearance!.uiFontSource(family)};
export function toast(value:unknown){document.dispatchEvent(new CustomEvent('clipper:feedback',{detail:value}));}
