export const formatDefinitions=[
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
 {name:'image/webp',label:'WebP 原图',mime:'image/webp',extension:'webp'}
] as const;
export type FormatName=typeof formatDefinitions[number]['name'];
export interface StoredFormat{name:FormatName;data:string}
export function formatDefinition(name:unknown){return formatDefinitions.find(f=>f.name===name);}
export function validateFormats(value:unknown,maxBytes:number):StoredFormat[]{if(!Array.isArray(value)||value.length>formatDefinitions.length)throw new Error('原始格式列表无效');let total=0;const names=new Set();const result=value.map(v=>{if(!v||!formatDefinition(v.name)||names.has(v.name)||typeof v.data!=='string'||!v.data.length||v.data.length>maxBytes*1.34||v.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(v.data)||Buffer.from(v.data,'base64').toString('base64')!==v.data)throw new Error('原始格式或编码无效');names.add(v.name);total+=Buffer.byteLength(v.data,'base64');if(total>maxBytes)throw new Error('原始格式总量超过限制');return {name:v.name as FormatName,data:v.data as string};});return result.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);}
export function htmlClipboard(html:string){const before='<html><body><!--StartFragment-->',after='<!--EndFragment--></body></html>';let header='Version:1.0\r\nStartHTML:0000000000\r\nEndHTML:0000000000\r\nStartFragment:0000000000\r\nEndFragment:0000000000\r\n';const start=Buffer.byteLength(header),fragment=start+Buffer.byteLength(before),end=fragment+Buffer.byteLength(html);for(const [key,n]of [['StartHTML',start],['EndHTML',end+Buffer.byteLength(after)],['StartFragment',fragment],['EndFragment',end]] as const)header=header.replace(key+':0000000000',key+':'+String(n).padStart(10,'0'));return Buffer.from(header+before+html+after+'\0','utf8');}
export function htmlContext(data:Buffer){const lines=data.subarray(0,Math.min(data.length,8192)).toString('utf8').split(/\r?\n/),fields=new Map<string,string>();for(const line of lines){const m=line.match(/^(Version|StartHTML|EndHTML|StartFragment|EndFragment|StartSelection|EndSelection|SourceURL):([^\0]*)$/i);if(!m)break;fields.set(m[1].toLowerCase(),m[2]);}const source=fields.get('sourceurl')?.slice(0,2048),number=(key:string)=>{const v=fields.get(key);return v&&/^-?\d+$/.test(v)?Number(v):-1;},start=number('startfragment'),end=number('endfragment');return {sourceUrl:source||undefined,fragment:start>=0&&end>=start&&end<=data.length?data.subarray(start,end).toString('utf8'):undefined};}
export interface ContentInfo {formats:{name:string;label:string;bytes:number;exportable:boolean}[];image?:{width:number;height:number};sourceUrl?:string;attachments?:{index:number;name:string;bytes:number;directory?:true;created?:number;modified?:number;accessed?:number;attributes?:number}[];files?:{path:string;name:string;type:string;bytes?:number;modified?:number;status:'available'|'missing'|'unreadable'|'not-read'}[]}
export function publicPNG(data:Buffer){if(data.length<33||data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('PNG 格式无效');const chunks=[data.subarray(0,8)];let at=8,ended=false;while(at+12<=data.length){const size=data.readUInt32BE(at),end=at+size+12;if(end>data.length)throw new Error('PNG 数据不完整');const type=data.toString('ascii',at+4,at+8);if(['IHDR','PLTE','tRNS','IDAT','IEND'].includes(type))chunks.push(data.subarray(at,end));at=end;if(type==='IEND'){ended=true;break;}}if(!ended)throw new Error('PNG 数据不完整');return Buffer.concat(chunks);}
