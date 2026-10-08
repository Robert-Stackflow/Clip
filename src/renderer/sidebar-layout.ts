export const sidebarGroups={
 clipboard:['history','stack','shelf','replies'],
 tools:['text-tools','capture-tools','symbols','cheats'],
 connections:['sync','web','uri']
} as const;
export type SidebarGroup=keyof typeof sidebarGroups;
export interface SidebarLayout{order:Record<SidebarGroup,string[]>;hidden:string[];categoriesVisible:boolean}
const storageKey='clip-sidebar-layout-v1';
const groups=Object.keys(sidebarGroups) as SidebarGroup[];
const known=new Set<string>(groups.flatMap(group=>[...sidebarGroups[group]]));

function normalize(value:unknown):SidebarLayout{
 const saved=value&&typeof value==='object'?value as Partial<SidebarLayout>:{};
 const order={} as SidebarLayout['order'];
 for(const group of groups){const defaults=[...sidebarGroups[group]],candidate=saved.order?.[group];order[group]=[...new Set([...(Array.isArray(candidate)?candidate.map(key=>key==='ai'||key==='scripts'?'text-tools':key).filter((key):key is string=>typeof key==='string'&&defaults.includes(key as never)):[]),...defaults])];}
 const hidden=Array.isArray(saved.hidden)?saved.hidden.filter((key):key is string=>typeof key==='string'&&known.has(key)):[];
 if(saved.hidden?.includes('ai')&&saved.hidden.includes('scripts')&&!hidden.includes('text-tools'))hidden.push('text-tools');
 return {order,hidden,categoriesVisible:saved.categoriesVisible!==false};
}
export function readSidebarLayout():SidebarLayout{try{return normalize(JSON.parse(localStorage.getItem(storageKey)||'null'));}catch{return normalize(null);}}
export function saveSidebarLayout(value:SidebarLayout){const clean=normalize(value);localStorage.setItem(storageKey,JSON.stringify(clean));applySidebarLayout(clean);}
export function applySidebarLayout(value=readSidebarLayout()){
 for(const group of groups){const section=document.querySelector<HTMLElement>(`[data-sidebar-group="${group}"]`),nav=section?.querySelector('nav');if(!section||!nav)continue;for(const key of value.order[group]){const button=nav.querySelector<HTMLElement>(`[data-page="${key}"]`);if(button){button.hidden=value.hidden.includes(key);nav.append(button);}}section.hidden=!value.order[group].some(key=>!value.hidden.includes(key));}
 const categories=document.getElementById('categories');if(categories)categories.hidden=!value.categoriesVisible;
}
