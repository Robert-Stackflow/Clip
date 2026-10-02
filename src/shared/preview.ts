import type {Payload,Clip,Snippet} from './types';
export interface PreviewPayload {
 text?:string;files?:string[];attachments?:{name:string;directory?:true;bytes:number}[];
 png:boolean;html:boolean;rtf:boolean;formats?:{name:string;bytes:number}[];omittedFormats?:string[];
}
export interface ClipPreview extends Clip {payload:PreviewPayload;imageURL?:string}
export interface SnippetPreview extends Omit<Snippet,'payload'> {payload:PreviewPayload;revision:number;imageURL?:string}
export type SnippetSummary=Omit<SnippetPreview,'payload'|'imageURL'>;
const bytes=(s:string)=>Math.floor(s.length*3/4)-(s.endsWith('==')?2:s.endsWith('=')?1:0);
/** Metadata only. Original payloads remain the authority for copy, export and tools. */
export function previewPayload(p:Payload):PreviewPayload{return {
 ...(p.text!==undefined?{text:p.text}:{}),...(p.files?{files:p.files}:{}),
 ...(p.attachments?{attachments:p.attachments.map(a=>({name:a.name,...(a.directory?{directory:true as const}:{}),bytes:bytes(a.data)}))}:{}),
 png:!!p.png,html:!!p.html,rtf:!!p.rtf,
 ...(p.formats?{formats:p.formats.map(f=>({name:f.name,bytes:bytes(f.data)}))}:{}),...(p.omittedFormats?{omittedFormats:p.omittedFormats}:{})
};}
