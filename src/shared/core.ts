import {validateAttachments} from './attachments';
import {validateFormats,formatDefinition} from './formats';
import type { Kind, Payload, Settings, Detail, Snippet, Category } from './types';
import { validateCategory } from './advanced';
import {validateScript,type TextScriptInput} from './text-tools';
export const MAX_TEXT = 1024*1024;
export const MAX_ITEM = 16*1024*1024;
export const MAX_TOTAL = 256*1024*1024;
export const defaults:Settings={theme:'system',view:'list',paused:false,maxItems:1000,retentionDays:30,excludedApps:['1password.exe','bitwarden.exe','keepass.exe','keepassxc.exe'],shortcut:'Control+Shift+V',quickShortcut:'Control+Alt+V',nextShortcut:'Control+Alt+N',launchAtLogin:false};
export function classify(p:Payload):Kind {
  if(p.files?.length||p.attachments?.length)return 'files'; if(p.png||p.formats?.some(f=>formatDefinition(f.name)?.mime.startsWith('image/')))return 'image';
  const t=(p.text||'').trim();
  if(/^https?:\/\/\S+$/i.test(t))return 'link';
  if(/^(\s*(import .+ from |export (default |const |function )|function \w+\(|(?:const|let|var) \w+\s*=|def \w+\(|class \w+[({:]|SELECT .+ FROM |\{\s*"[^"\n]+"\s*:))/im.test(t))return 'code';
  return 'text';
}
export function validatePayload(value:unknown):Payload {
  if(!value||typeof value!=='object')throw new Error('内容格式无效');
  const v=value as Payload,p:Payload={};
  for(const k of ['text','html','rtf'] as const)if(v[k]!==undefined){if(typeof v[k]!=='string'||Buffer.byteLength(v[k]!)>(k==='text'?MAX_TEXT:MAX_ITEM))throw new Error('文字或格式内容过大');p[k]=v[k];}
  if(v.png!==undefined){if(typeof v.png!=='string'||!/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(v.png)||v.png.length>MAX_ITEM*1.34)throw new Error('PNG 图片无效或过大');p.png=v.png;}
  if(v.files!==undefined){if(!Array.isArray(v.files)||!v.files.length||v.files.length>256||v.files.some(f=>typeof f!=='string'||f.length>32767||/[\0\r\n]/.test(f)||!/^([A-Za-z]:\\|\\\\[^\\]+\\[^\\]+)/.test(f)))throw new Error('文件路径无效');p.files=[...v.files];}
  if(v.formats!==undefined){const formats=validateFormats(v.formats,MAX_ITEM);if(formats.length)p.formats=formats;}
  if(v.attachments!==undefined){if(['text','html','rtf','png','files','formats'].some(k=>(v as any)[k]!==undefined))throw new Error('附件不能与其他内容混合');p.attachments=validateAttachments(v.attachments);}
  if(!p.text?.trim()&&!p.png&&!p.files?.length&&!p.html&&!p.rtf&&!p.formats?.length&&!p.attachments?.length)throw new Error('内容为空');
  if(Buffer.byteLength(JSON.stringify(p))>MAX_ITEM)throw new Error('单条内容超过 16 MiB');return p;
}
export function validateTags(value:unknown):string[]{if(!Array.isArray(value)||value.length>12||value.some(t=>typeof t!=='string'||t.length>32))throw new Error('标签最多 12 个，每个 32 字');return [...new Set(value.map(t=>t.trim()).filter(Boolean))];}
export function validateSettings(value:unknown):Settings {
  if(!value||typeof value!=='object')throw new Error('设置无效'); const v=value as Settings;
  if(!['system','light','dark'].includes(v.theme)||!['list','grid'].includes(v.view)||typeof v.paused!=='boolean'||typeof v.launchAtLogin!=='boolean')throw new Error('设置无效');
  if(!Number.isInteger(v.maxItems)||v.maxItems<50||v.maxItems>10000||!Number.isInteger(v.retentionDays)||v.retentionDays<1||v.retentionDays>365)throw new Error('条数需为 50–10000，保留天数需为 1–365');
  if(!Array.isArray(v.excludedApps)||v.excludedApps.length>100||v.excludedApps.some(s=>typeof s!=='string'||s.length>100||!s.trim()))throw new Error('排除应用无效');
  for(const k of ['shortcut','quickShortcut','nextShortcut'] as const)if(typeof v[k]!=='string'||! /^(?:(?:Control|Alt|Shift|Super)\+)+(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(v[k])||v[k].split('+').length<3)throw new Error('快捷键需包含修饰键与字母、数字或 F 键');
  if(new Set([v.shortcut,v.quickShortcut,v.nextShortcut]).size!==3)throw new Error('三个快捷键不能相同');
  return {theme:v.theme,view:v.view,paused:v.paused,maxItems:v.maxItems,retentionDays:v.retentionDays,excludedApps:[...new Set(v.excludedApps.map(s=>s.trim().toLowerCase()))],shortcut:v.shortcut,quickShortcut:v.quickShortcut,nextShortcut:v.nextShortcut,launchAtLogin:v.launchAtLogin};
}
export function validateBackup(value:unknown):{clips:Detail[];snippets:Snippet[];categories:Category[];scripts:TextScriptInput[]} {
  const b=value as any;if(!b||b.format!=='clipper-backup'||![1,2,3,4,5,6].includes(b.version)||!Array.isArray(b.clips)||!Array.isArray(b.snippets)||b.clips.length>10000||b.snippets.length>2000)throw new Error('不是受支持的 Clipper 备份');
  let total=0;
  const backupPayload=(value:any)=>{if(b.version<6&&value?.attachments!==undefined)validateAttachments(value.attachments,true);return validatePayload(value);};
  const clips=b.clips.map((c:any)=>{const payload=backupPayload(c?.payload);total+=Buffer.byteLength(JSON.stringify(payload));if(total>MAX_TOTAL)throw new Error('备份内容超过容量限制');if(typeof c.source!=='string'||c.source.length>256||typeof c.favorite!=='boolean'||typeof c.pinned!=='boolean'||!Number.isSafeInteger(c.createdAt)||c.createdAt<0||!Number.isSafeInteger(c.updatedAt)||c.updatedAt<0)throw new Error('备份记录无效');return {...c,payload,tags:validateTags(c.tags)};});
  const snippets=b.snippets.map((s:any)=>{if(!s||typeof s.title!=='string'||!s.title.trim()||s.title.length>120)throw new Error('备份模板无效');const payload=backupPayload(s.payload??{text:s.text});total+=Buffer.byteLength(JSON.stringify(payload));if(total>MAX_TOTAL)throw new Error('备份内容超过容量限制');return {title:s.title,text:payload.text||'',payload,kind:classify(payload)};});
  const categoryValues=b.version>=2?b.categories??[]:[];if(!Array.isArray(categoryValues)||categoryValues.length>50)throw new Error('备份分类无效');const categories=categoryValues.map(v=>({...validateCategory(v),id:''}));
  const scriptValues=b.version>=3?b.scripts:[];if(!Array.isArray(scriptValues)||scriptValues.length>100||Buffer.byteLength(JSON.stringify(scriptValues))>4*1024*1024)throw new Error('备份脚本无效或过大');const scripts=scriptValues.map(validateScript);
  return {clips,snippets,categories,scripts};
}
