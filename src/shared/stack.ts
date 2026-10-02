import type {Detail,Kind,Payload} from './types';
export interface StackOptions {kind:'all'|Kind;source:string;contains:string;mode:'whole'|'lines';trim:boolean}
export interface StackState {options:StackOptions;running:boolean;reason:string}
export interface StackPreview {token:string;matched:number;added:number;duplicates:number;samples:string[]}
export const stackDefaults:StackOptions={kind:'all',source:'',contains:'',mode:'whole',trim:true};
export function validateStack(value:unknown):StackOptions {
 const v=value as StackOptions;
 if(!v||!['all','text','link','code','image','files'].includes(v.kind)||!['whole','lines'].includes(v.mode)||typeof v.trim!=='boolean'||typeof v.source!=='string'||v.source.length>256||/[\\/:*?"<>|\x00-\x1f]/.test(v.source)||typeof v.contains!=='string'||v.contains.length>256||/[\x00-\x1f]/.test(v.contains))throw new Error('堆栈规则无效，请检查类型、来源和包含词');
 return {kind:v.kind,source:v.source.trim().toLowerCase(),contains:v.contains.trim(),mode:v.mode,trim:v.trim};
}
export function matchesStack(item:Detail,options:StackOptions,source=item.source):boolean {
 if(options.kind!=='all'&&item.kind!==options.kind||options.source&&source.toLowerCase()!==options.source)return false;
 if(options.mode==='lines'&&(!item.payload.text||item.kind==='image'||item.kind==='files'))return false;
 const text=[item.payload.text||'',...(item.payload.files||[]),...(item.payload.attachments||[]).map(a=>a.name)].join('\n');
 return !options.contains||text.toLowerCase().includes(options.contains.toLowerCase());
}
export function stackParts(item:Detail,options:StackOptions):{payloads:Payload[];duplicates:number} {
 if(options.mode==='whole')return {payloads:[item.payload],duplicates:0};
 const lines=(item.payload.text||'').split(/\r\n|\r|\n/).map(s=>options.trim?s.trim():s).filter(s=>s.trim().length>0);
 const unique=[...new Set(lines)];if(unique.length>200)throw new Error('拆分后超过 200 项，请缩小范围');
 return {payloads:unique.map(text=>({text})),duplicates:lines.length-unique.length};
}
