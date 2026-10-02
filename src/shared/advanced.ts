import {t as tr} from './i18n';
import type { Category, Detail, Payload } from './types';
export const categoryColors=['#7b8e9c','#7e9581','#ac946c','#9c83a5','#b7837b','#888888'];
export function validateCategory(value:unknown):Omit<Category,'id'>&{id?:string}{
  const v=value as Category;if(!v||typeof v.name!=='string'||!v.name.trim()||v.name.length>40||!categoryColors.includes(v.color)||!['all','text','link','code','image','files'].includes(v.kind))throw new Error(tr('分类名称、颜色或类型无效'));
  for(const key of ['contains','source','tag'] as const)if(typeof v[key]!=='string'||v[key].length>200)throw new Error(tr('分类条件过长'));
  if(v.kind==='all'&&!v.contains.trim()&&!v.source.trim()&&!v.tag.trim())throw new Error(tr('至少指定一个分类条件'));
  return {id:v.id,name:v.name.trim(),color:v.color,kind:v.kind,contains:v.contains.trim(),source:v.source.trim(),tag:v.tag.trim()};
}
export function matchesCategory(item:Detail,category:Category){
  return (category.kind==='all'||category.kind===item.kind)&&(!category.source||item.source.toLocaleLowerCase().includes(category.source.toLocaleLowerCase()))&&(!category.tag||item.tags.some(t=>t.toLocaleLowerCase()===category.tag.toLocaleLowerCase()))&&(!category.contains||[item.title,item.payload.text,...(item.payload.files||[]),...(item.payload.attachments?.map(a=>a.name)||[])].join('\n').toLocaleLowerCase().includes(category.contains.toLocaleLowerCase()));
}
export const builtins=['日期','时间'];
export function templateVariables(text:string):string[]{return [...new Set([...text.matchAll(/\{\{\s*([^{}\r\n]{1,32}?)\s*\}\}/g)].map(m=>m[1].trim()))].filter(Boolean);}
export function fillTemplate(payload:Payload,values:unknown={},now=new Date()):Payload{
  if(!payload.text||!templateVariables(payload.text).length)return {...payload};
  if(!values||typeof values!=='object'||Array.isArray(values))throw new Error(tr('模板变量无效'));
  const fields=values as Record<string,unknown>,variables=templateVariables(payload.text);if(variables.length>30)throw new Error(tr('模板变量最多 30 个'));
  if(Object.keys(fields).some(k=>!variables.includes(k)))throw new Error(tr('包含未知模板变量'));
  const two=(n:number)=>String(n).padStart(2,'0');const built:Record<string,string>={'日期':`${now.getFullYear()}-${two(now.getMonth()+1)}-${two(now.getDate())}`,'时间':`${two(now.getHours())}:${two(now.getMinutes())}`};
  for(const key of variables)if(!builtins.includes(key)&&(typeof fields[key]!=='string'||!(fields[key] as string).trim()||(fields[key] as string).length>10000))throw new Error(tr`请填写模板变量：${key}`);
  // Variable expansion intentionally produces plain text; never interpolate into stored HTML.
  const text=payload.text.replace(/\{\{\s*([^{}\r\n]{1,32}?)\s*\}\}/g,(_match,name:string)=>{const key=name.trim();return Object.hasOwn(built,key)?built[key]:String(fields[key]);});
  if(new TextEncoder().encode(text).length>1024*1024)throw new Error(tr('替换后的文字超过 1 MiB'));return {text};
}
export function cropRectangle(rect:{x:number;y:number;width:number;height:number},viewport:{width:number;height:number},pixels:{width:number;height:number}){
  if(!rect||[rect.x,rect.y,rect.width,rect.height,viewport.width,viewport.height,pixels.width,pixels.height].some(x=>!Number.isFinite(x))||viewport.width<=0||viewport.height<=0||rect.width<2||rect.height<2||rect.x<0||rect.y<0||rect.x+rect.width>viewport.width+1||rect.y+rect.height>viewport.height+1)throw new Error(tr('截图选区无效'));
  const x=Math.floor(rect.x*pixels.width/viewport.width),y=Math.floor(rect.y*pixels.height/viewport.height);
  const right=Math.min(pixels.width,Math.ceil((rect.x+rect.width)*pixels.width/viewport.width)),bottom=Math.min(pixels.height,Math.ceil((rect.y+rect.height)*pixels.height/viewport.height));
  return {x,y,width:right-x,height:bottom-y};
}
