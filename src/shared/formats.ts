import {canonicalBase64} from './base64';
import {t as tr} from './i18n';
export const formatDefinitions=[
 {name:'CF_DIBV5',label:'DIBV5 原始色彩数据',mime:'image/x-dib',extension:'dib'},
 {name:'CF_DIB',label:'DIB 原始色彩数据',mime:'image/x-dib',extension:'dib'},
 {name:'HTML Format',label:'HTML 原始上下文',mime:'text/html',extension:'cfhtml'},
 {name:'Rich Text Format',label:'RTF 富文本',mime:'text/rtf',extension:'rtf'},
 {name:'PNG',label:'PNG 原图',mime:'image/png',extension:'png'},
 {name:'JFIF',label:'JPEG 原图',mime:'image/jpeg',extension:'jpg'},
 {name:'image/jpeg',label:'JPEG 原图',mime:'image/jpeg',extension:'jpg'},
 {name:'GIF',label:'GIF 原图',mime:'image/gif',extension:'gif'},
 {name:'image/gif',label:'GIF 原图',mime:'image/gif',extension:'gif'},
 {name:'TIFF',label:'TIFF 原图',mime:'image/tiff',extension:'tif'},
 {name:'image/tiff',label:'TIFF 原图',mime:'image/tiff',extension:'tif'},
 {name:'image/bmp',label:'BMP 原图',mime:'image/bmp',extension:'bmp'},
 {name:'image/webp',label:'WebP 原图',mime:'image/webp',extension:'webp'},
 {name:'image/avif',label:'AVIF 原图',mime:'image/avif',extension:'avif'},
 {name:'image/svg+xml',label:'SVG 原图',mime:'image/svg+xml',extension:'svg'},
 {name:'image/heic',label:'HEIC 原图',mime:'image/heic',extension:'heic'},
 {name:'image/heif',label:'HEIF 原图',mime:'image/heif',extension:'heif'}
] as const;
export type FormatName=string;
export const MAX_FORMATS=32;
// These formats describe live COM objects, file transfers, process state or privacy controls.
const unsafeFormat=/^(?:CF_|Ole|DataObject|Embed Source|Embedded Object|Object Descriptor|Link Source|Link Source Descriptor|FileContents|FileGroupDescriptor|Shell |Shell\.|Preferred DropEffect|Performed DropEffect|Logical Performed DropEffect|Paste Succeeded|InShellDragLoop|DragContext|DragImageBits|DropDescription|AsyncFlag|UsingDefaultDragImage|IsShowingLayered|IsShowingText|CanIncludeInClipboardHistory|CanUploadToCloudClipboard|ExcludeClipboardContentFromMonitorProcessing|Clipboard Viewer Ignore|org\.nspasteboard\.ConcealedType|Clipper\.)/i;
export function persistableFormat(name:unknown):name is string{return typeof name==='string'&&name.length>0&&name.length<=128&&!/[\x00-\x1f\x7f]/.test(name)&&name===name.trim()&&(name==='CF_DIB'||name==='CF_DIBV5'||!unsafeFormat.test(name));}
export function clipboardFormatId(name:string):number|string{return name==='CF_DIB'?8:name==='CF_DIBV5'?17:name;}
export interface StoredFormat{name:FormatName;data:string}
export function formatDefinition(name:unknown){return formatDefinitions.find(f=>f.name===name)||(persistableFormat(name)?{name,label:tr('应用原始格式'),mime:'application/octet-stream',extension:'bin'}:undefined);}
export function validateFormats(value:unknown,maxBytes:number):StoredFormat[]{if(!Array.isArray(value)||value.length>MAX_FORMATS)throw new Error(tr('原始格式列表无效'));let total=0;const names=new Set();const result=value.map(v=>{if(!v||!formatDefinition(v.name)||names.has(v.name)||typeof v.data!=='string'||!v.data.length||v.data.length>maxBytes*1.34||!canonicalBase64(v.data))throw new Error(tr('原始格式或编码无效'));names.add(v.name);if(v.name==='CF_DIB'||v.name==='CF_DIBV5')validateDIB(Buffer.from(v.data,'base64'),v.name==='CF_DIBV5');total+=Buffer.byteLength(v.data,'base64');if(total>maxBytes)throw new Error(tr('原始格式总量超过限制'));return {name:v.name as FormatName,data:v.data as string};});return result.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);}
export function validateDIB(data:Buffer,v5=false){
 if(data.length<12)throw new Error(tr('DIB 数据不完整'));const header=data.readUInt32LE(0);if(![12,40,52,56,108,124].includes(header)||data.length<header||v5&&header!==124)throw new Error(tr('DIB 头部无效'));
 const core=header===12,width=core?data.readUInt16LE(4):data.readInt32LE(4),height=Math.abs(core?data.readUInt16LE(6):data.readInt32LE(8)),planes=data.readUInt16LE(core?8:12),bits=data.readUInt16LE(core?10:14),compression=core?0:data.readUInt32LE(16);
 if(width<1||height<1||width>16384||height>16384||width*height>40000000||planes!==1||![0,1,4,8,16,24,32].includes(bits)||bits===0&&![4,5].includes(compression)||![0,1,2,3,4,5,6].includes(compression))throw new Error(tr('DIB 像素或压缩格式无效'));
 const colors=core?(bits<=8?2**bits:0):data.readUInt32LE(32)||(bits>0&&bits<=8?2**bits:0);if(colors>256&&bits<=8||colors>65536)throw new Error(tr('DIB 调色板无效'));const start=header+(header===40&&[3,6].includes(compression)?(compression===6?16:12):0)+colors*(core?3:4);
 const size=[0,3,6].includes(compression)?Math.ceil(width*bits/32)*4*height:data.readUInt32LE(20);if(start>data.length||size<1||size>data.length-start)throw new Error(tr('DIB 像素数据不完整'));
 if(header===124){const offset=data.readUInt32LE(112),length=data.readUInt32LE(116);if(length&&(offset<header||offset>data.length||length>data.length-offset||offset<start+size&&offset+length>start))throw new Error(tr('DIB 色彩配置数据无效'));}return {width,height};
}
export function htmlClipboard(html:string){const before='<html><body><!--StartFragment-->',after='<!--EndFragment--></body></html>';let header='Version:1.0\r\nStartHTML:0000000000\r\nEndHTML:0000000000\r\nStartFragment:0000000000\r\nEndFragment:0000000000\r\n';const start=Buffer.byteLength(header),fragment=start+Buffer.byteLength(before),end=fragment+Buffer.byteLength(html);for(const [key,n]of [['StartHTML',start],['EndHTML',end+Buffer.byteLength(after)],['StartFragment',fragment],['EndFragment',end]] as const)header=header.replace(key+':0000000000',key+':'+String(n).padStart(10,'0'));return Buffer.from(header+before+html+after+'\0','utf8');}
export function htmlContext(data:Buffer){const lines=data.subarray(0,Math.min(data.length,8192)).toString('utf8').split(/\r?\n/),fields=new Map<string,string>();for(const line of lines){const m=line.match(/^(Version|StartHTML|EndHTML|StartFragment|EndFragment|StartSelection|EndSelection|SourceURL):([^\0]*)$/i);if(!m)break;fields.set(m[1].toLowerCase(),m[2]);}const source=fields.get('sourceurl')?.slice(0,2048),number=(key:string)=>{const v=fields.get(key);return v&&/^-?\d+$/.test(v)?Number(v):-1;},start=number('startfragment'),end=number('endfragment');return {sourceUrl:source||undefined,fragment:start>=0&&end>=start&&end<=data.length?data.subarray(start,end).toString('utf8'):undefined};}
export interface ContentInfo {formats:{name:string;label:string;bytes:number;exportable:boolean}[];image?:{width:number;height:number};sourceUrl?:string;attachments?:{index:number;name:string;bytes:number;directory?:true;created?:number;modified?:number;accessed?:number;attributes?:number}[];files?:{path:string;name:string;type:string;directory?:true;bytes?:number;modified?:number;status:'available'|'missing'|'unreadable'|'not-read'}[]}
export function publicPNG(data:Buffer){if(data.length<33||data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error(tr('PNG 格式无效'));const chunks=[data.subarray(0,8)];let at=8,ended=false;while(at+12<=data.length){const size=data.readUInt32BE(at),end=at+size+12;if(end>data.length)throw new Error(tr('PNG 数据不完整'));const type=data.toString('ascii',at+4,at+8);if(['IHDR','PLTE','tRNS','IDAT','IEND'].includes(type))chunks.push(data.subarray(at,end));at=end;if(type==='IEND'){ended=true;break;}}if(!ended)throw new Error(tr('PNG 数据不完整'));return Buffer.concat(chunks);}

export function payloadSyncVersion(p:{attachments?:unknown;formats?:StoredFormat[];omittedFormats?:string[]}){return p.attachments||p.omittedFormats?.length||p.formats?.some(f=>['CF_DIB','CF_DIBV5'].includes(f.name)||!formatDefinitions.some(d=>d.name===f.name))?5:p.formats?.length?4:3;}
