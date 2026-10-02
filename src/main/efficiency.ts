import {t as tr} from '../shared/i18n';
import {randomUUID,createHash} from 'node:crypto';
import type {Store} from './store';
import type {Snippet} from '../shared/types';
import {efficiencyDefaults,validateEfficiency,rememberSearch,searchTerm,type EfficiencyOptions,type ReplyIntent} from '../shared/efficiency';
export class EfficiencyService {
 private intent?:{view:ReplyIntent;delivered:boolean;target:{hwnd:number;pid:number};fingerprint:string;expires:number};
 constructor(private store:()=>Store){}
 options(){const s=this.store(),ids=new Set(s.snippetIDs()),options=validateEfficiency(s.meta('efficiency',efficiencyDefaults));return {...options,bindings:options.bindings.filter(b=>ids.has(b.id))};}
 state(){const options=this.options(),value=this.store().meta('recent-searches',[]);return {options,history:options.historyEnabled&&Array.isArray(value)?value.filter(t=>typeof t==='string'&&t.length<=512).slice(0,20):[]};}
 save(value:EfficiencyOptions){const next=validateEfficiency(value),s=this.store(),ids=new Set(s.snippetIDs());if(next.bindings.some(b=>!ids.has(b.id)))throw new Error(tr('模板已不存在'));s.setMeta('efficiency',next);if(!next.historyEnabled)s.setMeta('recent-searches',[]);}
 remember(value:unknown){const term=searchTerm(value),state=this.state();if(state.options.historyEnabled)this.store().setMeta('recent-searches',rememberSearch(state.history,term));}
 remove(value:unknown){const term=value===null?null:searchTerm(value),state=this.state();this.store().setMeta('recent-searches',term===null?[]:state.history.filter(t=>t!==term));}
 private fingerprint(s:Snippet){return createHash('sha256').update(JSON.stringify([s.id,s.title,s.payload,s.updatedAt])).digest('hex');}
 get active(){if(this.intent&&this.intent.expires<Date.now())this.cancel();return !!this.intent;}
 browse(){this.intent={view:{kind:'browse'},delivered:false,target:{hwnd:0,pid:0},fingerprint:'',expires:Date.now()+60000};}
 fill(snippet:Snippet,target:{hwnd:number;pid:number}){this.intent={view:{kind:'fill',token:randomUUID(),snippet},delivered:false,target,fingerprint:this.fingerprint(snippet),expires:Date.now()+10*60000};}
 take():ReplyIntent|null{if(!this.active||this.intent!.delivered)return null;const value=this.intent!;value.delivered=true;if(value.view.kind==='browse')this.intent=undefined;return value.view;}
 resolve(token:unknown){const pending=this.intent;if(!this.active||!pending||pending.view.kind!=='fill'||pending.view.token!==token)throw new Error(tr('快捷回复已过期，请重新按下快捷键'));
  const view=pending.view;let current:Snippet|undefined;try{current=this.store().snippet(view.snippet.id);}catch{}if(!current||this.fingerprint(current)!==pending.fingerprint)throw new Error(tr('模板已改变，请重新打开填写内容'));return {snippet:current,target:pending.target};}
 cancel(token?:unknown){if(token===undefined||this.intent?.view.kind==='fill'&&this.intent.view.token===token)this.intent=undefined;}
}
