import {t as tr} from './i18n';
import type { Category, Detail, Payload } from './types';
import {categoryIconValid} from './category-icons';
import {clipFilterPredicate,normalizeClipFilters} from './clip-filters';
export const categoryColors=['#3b82f6','#22a06b','#f59e0b','#ef4444','#8b5cf6','#ec4899','#64748b'];
export function categoryRegex(pattern:string):RegExp{
  // Restrict expensive constructs before a rule reaches the synchronous retention path.
  // A single repetition is enough for useful wildcard rules, while excluding
  // nested and chained repetitions that can stall synchronous cleanup/search.
  const unbounded=pattern.match(/(?<!\\)[*+?]/g)||[],bounded=pattern.match(/(?<!\\)\{\d+(?:,\d*)?\}/g)||[];
  if(pattern.length>120||/[()]/.test(pattern)||/\\[1-9]/.test(pattern)||unbounded.length>1||bounded.length>2||unbounded.length&&bounded.length||/\{(?:[1-9]\d{2,}|\d+,[1-9]\d{2,})\}/.test(pattern))throw new Error(tr('分类正则表达式过于复杂'));
  try{return new RegExp(pattern,'iu');}catch{throw new Error(tr('分类正则表达式无效'));}
}
export function validateCategory(value:unknown):Omit<Category,'id'>&{id?:string}{
  const v=value as Category;if(!v||typeof v.name!=='string'||!v.name.trim()||v.name.length>40||typeof v.color!=='string'||!/^#[\da-f]{6}$/i.test(v.color)||!['all','text','link','code','image','files'].includes(v.kind))throw new Error(tr('分类名称、颜色或类型无效'));
  if(v.icon!==undefined&&!categoryIconValid(v.icon))throw new Error(tr('分类图标无效'));
  if(v.id!==undefined&&(typeof v.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[4-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.id)))throw new Error(tr('分类标识无效'));
  for(const key of ['contains','source','tag'] as const)if(typeof v[key]!=='string'||v[key].length>200)throw new Error(tr('分类条件过长'));
  if(v.containsRegex!==undefined&&typeof v.containsRegex!=='boolean'||v.permanent!==undefined&&typeof v.permanent!=='boolean'||v.allowChildren!==undefined&&typeof v.allowChildren!=='boolean')throw new Error(tr('分类选项无效'));
  if(v.parentId!==undefined&&(typeof v.parentId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[4-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.parentId)))throw new Error(tr('父分类无效'));
  if(v.parentId&&v.parentId===v.id)throw new Error(tr('分类不能属于自身'));
  if(v.containsRegex&&v.contains.trim())categoryRegex(v.contains.trim());
  const period=['today','yesterday','week','month','custom'].includes(v.period||'')?v.period:undefined,from=/^\d{4}-\d{2}-\d{2}$/.test(v.from||'')?v.from:undefined,to=/^\d{4}-\d{2}-\d{2}$/.test(v.to||'')?v.to:undefined;
  if((v.from&&!from)||(v.to&&!to)||(v.period==='custom'&&!from&&!to))throw new Error(tr('分类日期无效'));
  if(v.extensions!==undefined&&(!Array.isArray(v.extensions)||v.extensions.length>16||v.extensions.some(extension=>typeof extension!=='string'||!/^[a-z0-9]{1,16}$/i.test(extension.replace(/^\./,'')))))throw new Error(tr('文件扩展名无效'));
  if(v.size!==undefined&&!['small','medium','large'].includes(v.size))throw new Error(tr('文件大小条件无效'));
  const extensions=[...new Set((v.extensions||[]).map(extension=>extension.trim().replace(/^\./,'').toLocaleLowerCase()).filter(Boolean))];
  if(!v.manual&&v.kind==='all'&&!v.contains.trim()&&!v.source.trim()&&!v.tag.trim()&&!period&&!v.favorite&&!v.pinned&&!extensions.length&&!v.size)throw new Error(tr('至少指定一个分类条件'));
  return {id:v.id,name:v.name.trim(),color:v.color,icon:v.icon,manual:!!v.manual||undefined,permanent:v.permanent===undefined?!!v.manual:v.permanent,containsRegex:!!v.containsRegex||undefined,parentId:v.parentId,allowChildren:!!v.allowChildren||undefined,kind:v.kind,contains:v.contains.trim(),source:v.source.trim(),tag:v.tag.trim(),period,from,to,favorite:v.favorite||undefined,pinned:v.pinned||undefined,extensions,size:v.size};
}
export function categoryPredicate(category:Category,now=Date.now()){
  if(category.manual)return (item:Detail)=>item.manualCategories?.includes(category.id)||false;
  const filter=normalizeClipFilters({kinds:[],sources:[],tags:[],period:category.period,from:category.from,to:category.to,favorite:category.favorite,pinned:category.pinned,extensions:category.extensions||[],size:category.size});
  const matchesFilter=clipFilterPredicate(filter,now),source=category.source.toLocaleLowerCase(),tag=category.tag.toLocaleLowerCase(),contains=category.contains.toLocaleLowerCase(),regex=category.containsRegex&&contains?categoryRegex(category.contains):undefined;
  return (item:Detail)=>(category.kind==='all'||category.kind===item.kind)&&matchesFilter(item)&&(!source||item.source.toLocaleLowerCase().includes(source))&&(!tag||item.tags.some(value=>value.toLocaleLowerCase()===tag))&&(!contains||(()=>{const content=[item.title,item.payload.text,...(item.payload.files||[]),...(item.payload.attachments?.map(attachment=>attachment.name)||[])].join('\n');return regex?regex.test(content.slice(0,8192)):content.toLocaleLowerCase().includes(contains);})());
}
export function matchesCategory(item:Detail,category:Category,now=Date.now()){return categoryPredicate(category,now)(item);}
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
