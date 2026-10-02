import {t as tr} from './i18n';
import type {Snippet} from './types';
export interface EfficiencyOptions {historyEnabled:boolean;repliesShortcut:string;bindings:{id:string;shortcut:string}[]}
export interface EfficiencyState {options:EfficiencyOptions;history:string[]}
export type ReplyIntent={kind:'browse'}|{kind:'fill';token:string;snippet:Snippet};
export const efficiencyDefaults:EfficiencyOptions={historyEnabled:false,repliesShortcut:'Control+Shift+R',bindings:[]};
export function shortcutKey(value:unknown,optional=false):string{
 if(optional&&value==='')return '';
 if(typeof value!=='string'||value.length>80||!/^(?:(?:Control|Alt|Shift|Super)\+)+(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(value))throw new Error(tr('快捷键需包含两个修饰键与字母、数字或 F 键'));
 const parts=value.split('+'),key=parts.pop()!;
 if(parts.length<2||new Set(parts).size!==parts.length)throw new Error(tr('快捷键需包含至少两个不同修饰键'));
 return [...['Control','Alt','Shift','Super'].filter(x=>parts.includes(x)),key].join('+');
}
export function validateEfficiency(value:unknown):EfficiencyOptions{
 const v=value as EfficiencyOptions;if(!v||typeof v.historyEnabled!=='boolean'||!Array.isArray(v.bindings)||v.bindings.length>100)throw new Error(tr('效率设置无效，最多 100 个模板快捷键'));
 const bindings=v.bindings.map(b=>{if(!b||typeof b.id!=='string'||! /^[0-9a-f-]{36}$/.test(b.id))throw new Error(tr('模板编号无效'));return {id:b.id,shortcut:shortcutKey(b.shortcut)};});
 const repliesShortcut=shortcutKey(v.repliesShortcut,true),keys=[...bindings.map(b=>b.shortcut),...(repliesShortcut?[repliesShortcut]:[])];
 if(new Set(bindings.map(b=>b.id)).size!==bindings.length||new Set(keys).size!==keys.length)throw new Error(tr('快捷键不能重复'));
 return {historyEnabled:v.historyEnabled,repliesShortcut,bindings};
}
export function searchTerm(value:unknown){if(typeof value!=='string'||value.length>512||/[\x00-\x1f\x7f]/.test(value))throw new Error(tr('搜索词须为最多 512 字的单行文字'));return value.trim();}
export function rememberSearch(history:string[],value:unknown){const term=searchTerm(value);return term?[term,...history.filter(t=>t.toLocaleLowerCase()!==term.toLocaleLowerCase())].slice(0,20):history;}
