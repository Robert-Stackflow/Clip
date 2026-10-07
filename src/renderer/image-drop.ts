import {IMAGE_DROP_TYPE,IMAGE_EXTENSIONS,originalImageURL,type ImageDrop,type ImageDrops} from '../shared/image-drop';
import {t as tr} from '../shared/i18n';
export function acceptsDrop(transfer:DataTransfer|null){return !!transfer?.types.some(type=>[IMAGE_DROP_TYPE,'Files','text/plain','text/html','text/uri-list','DownloadURL'].includes(type)||type.startsWith('image/'));}
function address(value:string,base?:string){try{return new URL(value,base).href;}catch{return undefined;}}
export function droppedImage(transfer:DataTransfer):ImageDrops|undefined{
 const custom=transfer.getData(IMAGE_DROP_TYPE);
 if(custom){if(custom.length>64*1024*1024)throw new Error(tr('图片文件过大'));let value;try{value=JSON.parse(custom);}catch{throw new Error(tr('图片文件无效'));}if(!Array.isArray(value)||!value.length||value.length>32)throw new Error(tr('图片文件无效'));return value;}
 const html=transfer.getData('text/html');if(html.length>2*1024*1024)throw new Error(tr('图片文件过大'));
 const doc=html?new DOMParser().parseFromString(html,'text/html'):undefined;
 const sourceURL=html.match(/(?:^|\n)SourceURL:(https?:[^\r\n]+)/i)?.[1]||doc?.querySelector('base')?.getAttribute('href')||undefined;
 const referrer=sourceURL&&/^https?:/.test(sourceURL)?sourceURL:undefined;
 const images:ImageDrop[]=[],seen=new Set<string>();
 const add=(value:string|undefined,evidence=false,fallback?:string)=>{if(!value)return;const url=address(value.trim(),sourceURL);if(!url||seen.has(url)||!(/^data:image\//i.test(url)||/^blob:/i.test(url)||/^file:/i.test(url)&&IMAGE_EXTENSIONS.test(url)||/^https?:/i.test(url)&&(evidence||IMAGE_EXTENSIONS.test(url))))return;seen.add(url);const original=originalImageURL(url);images.push({url:original,...(referrer?{referrer}:{}),...(original!==url?{fallback:url}:fallback&&fallback!==url?{fallback}: {})});};
 for(const image of doc?.querySelectorAll('img')||[]){
  const source=image.getAttribute('src')||undefined;
  const set=(image.getAttribute('srcset')||'').split(',').map(part=>part.trim().split(/\s+/)).sort((a,b)=>(parseFloat(b[1])||1)-(parseFloat(a[1])||1));
  const anchor=image.closest('a')?.getAttribute('href');
  const original=image.getAttribute('data-original')||image.getAttribute('data-full-src')||image.getAttribute('data-original-src')||(anchor&&IMAGE_EXTENSIONS.test(anchor)?anchor:undefined)||set[0]?.[0]||source;
  add(original,true,source&&address(source,sourceURL));
 }
 const download=transfer.getData('DownloadURL').match(/^image\/[^:]+:[^:]*:(.+)$/s)?.[1];add(download,true);
 for(const line of transfer.getData('text/uri-list').split(/\r?\n/)){if(!line.startsWith('#'))add(line);}
 if(!images.length)add(transfer.getData('text/plain'));
 if(images.length>32)throw new Error(tr('一次最多拖入 32 个文件'));
 return images.length===1?images[0]:images.length?images:undefined;
}
/** Snapshot drag data before its protected lifetime ends, then perform the import. */
export function importDroppedImage(transfer:DataTransfer,api:{dropFiles(files:File[]):Promise<void>;dropImage(value:ImageDrops):Promise<void>}):Promise<boolean>{
 const files=Array.from(transfer.files),images=droppedImage(transfer),items=images?(Array.isArray(images)?images:[images]):[];
 const custom=transfer.types.includes(IMAGE_DROP_TYPE),original=items.some(item=>'url'in item&&item.fallback);
 const blobs=items.some(item=>'url'in item&&item.url?.startsWith('blob:'));
 return (async()=>{
  if(custom||original){try{await api.dropImage(images!);return true;}catch(error){if(!files.length)throw error;await api.dropFiles(files);return true;}}
  if(files.length){try{await api.dropFiles(files);return true;}catch(error){if(!images||blobs)throw error;await api.dropImage(images);return true;}}
  if(blobs)throw new Error(tr('此图片需要浏览器权限，请启用浏览器拖放扩展'));
  if(images){await api.dropImage(images);return true;}return false;
 })();
}
