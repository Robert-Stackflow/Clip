import {createElement,AppWindow,ChevronDown,Check,Minus,Plus,Search,X,Image,RefreshCw,type IconNode} from 'lucide';
export const q=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const icons:Record<string,IconNode>={image:Image,app:AppWindow,'lucide:app':AppWindow,close:X,'chevron-down':ChevronDown,check:Check,minus:Minus,plus:Plus,search:Search,refresh:RefreshCw,'refresh-cw':RefreshCw};
const cache=new Map<string,string>();
/** One ui.ts icon and registration API; memoization avoids rebuilding hot list icons. */
export function registerIcons(catalog:Record<string,IconNode>){for(const [name,node]of Object.entries(catalog)){icons['lucide:'+name]=node;cache.delete('lucide:'+name);}}
export function icon(name:string){let value=cache.get(name);if(!value){value=createElement(icons[name]||Search,{'class':'icon lucide','aria-hidden':'true','focusable':'false','data-lucide-icon':name,'stroke-width':1.75}).outerHTML;cache.set(name,value);}return value;}
/** All icon-only actions use the same button, hover, focus and tooltip treatment. */
export function iconButton(id:string,label:string,glyph:string,active=false){const button=document.createElement('button');button.id=id;button.type='button';button.className='icon-button quiet'+(active?' active':'');button.title=label;button.setAttribute('aria-label',label);if(active)button.setAttribute('aria-pressed','true');button.innerHTML=icon(glyph);return button.outerHTML;}

document.documentElement.style.setProperty('--check-icon',`url("data:image/svg+xml,${encodeURIComponent(icon('check'))}")`);
export const api={installedFonts:(refresh=false)=>window.clipAppearance!.installedFonts(refresh),uiFontSource:(family:string)=>window.clipAppearance!.uiFontSource(family)};
export function toast(value:unknown){document.dispatchEvent(new CustomEvent('clip:feedback',{detail:value}));}
