import {t as tr} from './i18n';
import {validateAttachments} from './attachments';
import {validateFormats,formatDefinition,persistableFormat} from './formats';
import type { Kind, Payload, Settings, Detail, Snippet, Category } from './types';
import { validateCategory } from './advanced';
import {validateScript,type TextScriptInput} from './text-tools';
import {validateCommand,type TextCommandInput} from './commands';
import {shortcutKey} from './shortcut';
export const MAX_TEXT = 1024*1024;
export const MAX_ITEM = 16*1024*1024;
export const MAX_TOTAL = 1024*1024*1024;
/** Exact JSON size for validated content. Base64 fields need no escaping or temporary JSON copies. */
export function contentBytes(value:Payload|Detail|Snippet){let binary=0;const metadata=JSON.stringify(value,(key,entry)=>{if((key==='png'||key==='data')&&typeof entry==='string'){binary+=entry.length;return '';}return entry;});return binary+Buffer.byteLength(metadata);}
export const defaults:Settings={theme:'system',view:'list',cardDirection:'grid',trayClickAction:'open',paused:false,maxItems:1000,retentionDays:30,maxHistoryMiB:256,excludedApps:['1password.exe','bitwarden.exe','keepass.exe','keepassxc.exe'],shortcut:'Control+Shift+V',nextShortcut:'Control+Alt+N',launchAtLogin:false};
export function classify(p:Payload):Kind {
  if(p.files?.length||p.attachments?.length)return 'files';
  // A PowerPoint text selection also includes a rendered PNG. Its explicit
  // text-selection format keeps the history row editable as text while the
  // original image and private formats remain available for faithful paste.
  const selectedText=!!p.text?.trim()&&!!(p.html||p.rtf)&&!!p.formats?.some(f=>f.name==='Art::Text ClipFormat');
  if(!selectedText&&(p.png||p.formats?.some(f=>formatDefinition(f.name)?.mime.startsWith('image/'))))return 'image';
  const t=(p.text||'').trim();
  if(/^https?:\/\/\S+$/i.test(t))return 'link';
  if(/^(\s*(import .+ from |export (default |const |function )|function \w+\(|(?:const|let|var) \w+\s*=|def \w+\(|class \w+[({:]|SELECT .+ FROM |\{\s*"[^"\n]+"\s*:))/im.test(t))return 'code';
  return 'text';
}
export function validatePayload(value:unknown):Payload {
  if(!value||typeof value!=='object')throw new Error(tr('内容格式无效'));
  const v=value as Payload,p:Payload={};
  for(const k of ['text','html','rtf'] as const)if(v[k]!==undefined){if(typeof v[k]!=='string'||Buffer.byteLength(v[k]!)>(k==='text'?MAX_TEXT:MAX_ITEM))throw new Error(tr('文字或格式内容过大'));p[k]=v[k];}
  if(v.png!==undefined){if(typeof v.png!=='string'||!/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(v.png)||v.png.length>MAX_ITEM*1.34)throw new Error(tr('PNG 图片无效或过大'));p.png=v.png;}
  if(v.files!==undefined){if(!Array.isArray(v.files)||!v.files.length||v.files.length>256||v.files.some(f=>typeof f!=='string'||f.length>32767||/[\0\r\n]/.test(f)||!/^([A-Za-z]:\\|\\\\[^\\]+\\[^\\]+)/.test(f)))throw new Error(tr('文件路径无效'));p.files=[...v.files];}
  if(v.omittedFormats!==undefined){if(!Array.isArray(v.omittedFormats)||v.omittedFormats.length>32||v.omittedFormats.some(n=>!persistableFormat(n)))throw new Error(tr('未保留格式列表无效'));p.omittedFormats=[...new Set(v.omittedFormats)].sort();}
  if(v.formats!==undefined){const formats=validateFormats(v.formats,MAX_ITEM);if(formats.length)p.formats=formats;}
  if(v.attachments!==undefined){if(['text','html','rtf','png','files','formats','omittedFormats'].some(k=>(v as any)[k]!==undefined))throw new Error(tr('附件不能与其他内容混合'));p.attachments=validateAttachments(v.attachments);}
  if(!p.text?.trim()&&!p.png&&!p.files?.length&&!p.html&&!p.rtf&&!p.formats?.length&&!p.attachments?.length)throw new Error(tr('内容为空'));
  if(contentBytes(p)>MAX_ITEM)throw new Error(tr('单条内容超过 16 MiB'));return p;
}
export function validateTags(value:unknown):string[]{if(!Array.isArray(value)||value.length>12||value.some(t=>typeof t!=='string'||t.length>32))throw new Error(tr('标签最多 12 个，每个 32 字'));return [...new Set(value.map(t=>t.trim()).filter(Boolean))];}
export function validateSettings(value:unknown):Settings {
  if(!value||typeof value!=='object')throw new Error(tr('设置无效')); const v=value as Settings;
  if(!['system','light','dark'].includes(v.theme)||!['list','grid'].includes(v.view)||v.cardDirection!==undefined&&!['grid','vertical','horizontal'].includes(v.cardDirection)||typeof v.paused!=='boolean'||typeof v.launchAtLogin!=='boolean')throw new Error(tr('设置无效'));
  if(!Number.isInteger(v.maxItems)||v.maxItems<50||v.maxItems>10000||!Number.isInteger(v.retentionDays)||v.retentionDays<1||v.retentionDays>365)throw new Error(tr('条数需为 50–10000，保留天数需为 1–365'));
  const maxHistoryMiB=v.maxHistoryMiB??256;if(!Number.isInteger(maxHistoryMiB)||maxHistoryMiB<64||maxHistoryMiB>1024)throw new Error(tr('本地历史容量需为 64–1024 MiB'));
  if(!Array.isArray(v.excludedApps)||v.excludedApps.length>100||v.excludedApps.some(s=>typeof s!=='string'||s.length>100||!s.trim()))throw new Error(tr('排除应用无效'));
  const shortcut=shortcutKey(v.shortcut),nextShortcut=shortcutKey(v.nextShortcut);
  if(shortcut===nextShortcut)throw new Error(tr('两个快捷键不能相同'));
  const trayClickAction=v.trayClickAction===undefined?'open':v.trayClickAction;if(!['open','recent','quick','replies','shelf'].includes(trayClickAction))throw new Error(tr('托盘单击动作无效'));
  return {theme:v.theme,view:v.view,cardDirection:v.cardDirection||'grid',trayClickAction,paused:v.paused,maxItems:v.maxItems,retentionDays:v.retentionDays,maxHistoryMiB,excludedApps:[...new Set(v.excludedApps.map(s=>s.trim().toLowerCase()))],shortcut,nextShortcut,launchAtLogin:v.launchAtLogin};
}
export function validateBackup(value:unknown):{clips:Detail[];snippets:Snippet[];categories:Category[];scripts:TextScriptInput[];commands:TextCommandInput[]} {
  const b=value as any;if(!b||b.format!=='clipper-backup'||![1,2,3,4,5,6,7].includes(b.version)||!Array.isArray(b.clips)||!Array.isArray(b.snippets)||b.clips.length>10000||b.snippets.length>2000)throw new Error(tr('不是受支持的 Clipper 备份'));
  let total=0;
  const backupPayload=(value:any)=>{if(b.version<6&&value?.attachments!==undefined)validateAttachments(value.attachments,true);return validatePayload(value);};
  const clips=b.clips.map((c:any)=>{const payload=backupPayload(c?.payload);total+=Buffer.byteLength(JSON.stringify(payload));if(total>MAX_TOTAL)throw new Error(tr('备份内容超过容量限制'));if(typeof c.source!=='string'||c.source.length>256||typeof c.favorite!=='boolean'||typeof c.pinned!=='boolean'||!Number.isSafeInteger(c.createdAt)||c.createdAt<0||!Number.isSafeInteger(c.updatedAt)||c.updatedAt<0||c.manualCategories!==undefined&&(!Array.isArray(c.manualCategories)||c.manualCategories.length>50||c.manualCategories.some((id:unknown)=>typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[4-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))))throw new Error(tr('备份记录无效'));return {...c,payload,tags:validateTags(c.tags),manualCategories:c.manualCategories?[...new Set(c.manualCategories)]:undefined};});
  const snippets=b.snippets.map((s:any)=>{if(!s||typeof s.title!=='string'||!s.title.trim()||s.title.length>120)throw new Error(tr('备份模板无效'));const payload=backupPayload(s.payload??{text:s.text});total+=Buffer.byteLength(JSON.stringify(payload));if(total>MAX_TOTAL)throw new Error(tr('备份内容超过容量限制'));return {title:s.title,text:payload.text||'',payload,kind:classify(payload)};});
  const categoryValues=b.version>=2?b.categories??[]:[];if(!Array.isArray(categoryValues)||categoryValues.length>50)throw new Error(tr('备份分类无效'));const categories=categoryValues.map(v=>({...validateCategory(v),id:(v as Category).id||''}));
  for(const category of categories)if(category.parentId){const parent=categories.find(item=>item.id===category.parentId);if(!parent||!parent.allowChildren||parent.parentId)throw new Error(tr('备份子分类无效'));}
  const scriptValues=b.version>=3?b.scripts:[];if(!Array.isArray(scriptValues)||scriptValues.length>100||Buffer.byteLength(JSON.stringify(scriptValues))>4*1024*1024)throw new Error(tr('备份脚本无效或过大'));const scripts=scriptValues.map(validateScript);
  const commandValues=b.commands??[];if(!Array.isArray(commandValues)||commandValues.length>100||Buffer.byteLength(JSON.stringify(commandValues))>4*1024*1024)throw new Error(tr('备份指令无效或过大'));const commands=commandValues.map((value:any)=>validateCommand({title:value?.title,icon:value?.icon,prompt:value?.prompt}));
  return {clips,snippets,categories,scripts,commands};
}
