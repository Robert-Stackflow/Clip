import type {Clip,Kind} from './types';

export type ClipFilterPeriod='today'|'yesterday'|'week'|'month'|'custom';
export type ClipFilterSize='small'|'medium'|'large';

/** A renderer-owned query that can be applied to any projected collection. */
export interface ClipFilters {
  kinds:Kind[];
  sources:string[];
  period?:ClipFilterPeriod;
  from?:string;
  to?:string;
  favorite?:boolean;
  pinned?:boolean;
  tags:string[];
  extensions:string[];
  size?:ClipFilterSize;
}

const kinds:readonly Kind[]=['text','link','code','image','files'];
const day=24*60*60*1000;
const key=(value:string)=>value.trim().toLocaleLowerCase();

export function emptyClipFilters():ClipFilters{return {kinds:[],sources:[],tags:[],extensions:[]};}

export function normalizeClipFilters(value:Partial<ClipFilters>):ClipFilters{
  const unique=(values:readonly string[])=>[...new Set(values.map(key).filter(Boolean))];
  const requested=unique(value.kinds||[]).filter((kind):kind is Kind=>(kinds as readonly string[]).includes(kind));
  const period=['today','yesterday','week','month','custom'].includes(value.period||'')?value.period:undefined;
  const from=/^\d{4}-\d{2}-\d{2}$/.test(value.from||'')?value.from:undefined;
  const to=/^\d{4}-\d{2}-\d{2}$/.test(value.to||'')?value.to:undefined;
  return {kinds:requested,sources:unique(value.sources||[]),period:period as ClipFilterPeriod|undefined,from,to,favorite:!!value.favorite||undefined,pinned:!!value.pinned||undefined,tags:unique(value.tags||[]),extensions:unique((value.extensions||[]).map(extension=>extension.replace(/^\./,''))),size:['small','medium','large'].includes(value.size||'')?value.size:undefined};
}

function localStart(value:Date){return new Date(value.getFullYear(),value.getMonth(),value.getDate()).getTime();}
function dateValue(value:string){const [year,month,dayOfMonth]=value.split('-').map(Number);return new Date(year,month-1,dayOfMonth).getTime();}

/** The end is exclusive so adjacent day filters cannot overlap. */
export function filterDateRange(filters:ClipFilters,now=Date.now()):{from?:number;to?:number}{
  const normalized=normalizeClipFilters(filters),today=localStart(new Date(now));
  if(normalized.period==='today')return {from:today,to:today+day};
  if(normalized.period==='yesterday')return {from:today-day,to:today};
  if(normalized.period==='week'){const monday=(new Date(now).getDay()+6)%7;return {from:today-monday*day,to:today+day};}
  if(normalized.period==='month'){const date=new Date(now);return {from:new Date(date.getFullYear(),date.getMonth(),1).getTime(),to:today+day};}
  if(normalized.period==='custom')return {from:normalized.from?dateValue(normalized.from):undefined,to:normalized.to?dateValue(normalized.to)+day:undefined};
  return {};
}

export function clipExtension(clip:Clip){
  if(clip.kind!=='files')return '';
  const filename=(clip.title||clip.preview).trim().split(/[\\/]/).pop()||'';
  const match=/\.([a-z0-9]{1,16})$/i.exec(filename);
  return match?.[1].toLocaleLowerCase()||'';
}

function matchesNormalizedClipFilters(clip:Clip,normalized:ClipFilters,range:{from?:number;to?:number}){
  const source=key(clip.source);
  if(normalized.kinds.length&&!normalized.kinds.includes(clip.kind))return false;
  if(normalized.sources.length&&!normalized.sources.includes(source))return false;
  if(normalized.favorite&&!clip.favorite)return false;
  if(normalized.pinned&&!clip.pinned)return false;
  if(normalized.tags.length){const tags=new Set(clip.tags.map(key));if(!normalized.tags.every(tag=>tags.has(tag)))return false;}
  if(normalized.extensions.length&&!normalized.extensions.includes(clipExtension(clip)))return false;
  if(normalized.size==='small'&&clip.bytes>=1024*1024)return false;
  if(normalized.size==='medium'&&(clip.bytes<1024*1024||clip.bytes>=10*1024*1024))return false;
  if(normalized.size==='large'&&clip.bytes<10*1024*1024)return false;
  if(range.from!==undefined&&clip.createdAt<range.from)return false;
  if(range.to!==undefined&&clip.createdAt>=range.to)return false;
  return true;
}

export function clipFilterPredicate(filters:ClipFilters,now=Date.now()){
  const normalized=normalizeClipFilters(filters),range=filterDateRange(normalized,now);
  return (clip:Clip)=>matchesNormalizedClipFilters(clip,normalized,range);
}

export function matchesClipFilters(clip:Clip,filters:ClipFilters,now=Date.now()){return clipFilterPredicate(filters,now)(clip);}

export function filterClips<T extends Clip>(clips:readonly T[],filters:ClipFilters,now=Date.now()){const match=clipFilterPredicate(filters,now);return clips.filter(match);}

export function hasClipFilters(filters:ClipFilters){const value=normalizeClipFilters(filters);return !!(value.kinds.length||value.sources.length||value.period||value.favorite||value.pinned||value.tags.length||value.extensions.length||value.size);}
