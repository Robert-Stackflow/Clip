import {t as tr} from './i18n';
export interface ShortcutInput {type:'keyDown'|'keyUp';key:string;code:string;control:boolean;alt:boolean;shift:boolean;meta:boolean}

const modifiers=['Control','Alt','Shift','Super'];
const aliases:Record<string,string>={ctrl:'Control',control:'Control',alt:'Alt',shift:'Shift',win:'Super',meta:'Super',super:'Super'};
const keys=['Space','Tab','Enter','Escape','Backspace','Delete','Home','End','PageUp','PageDown','Up','Down','Left','Right'];
/** Use Electron accelerator names in storage and Win/Ctrl names in the interface. */
export function shortcutKey(value:unknown,optional=false):string{
 if(optional&&value==='')return '';
 if(typeof value!=='string'||value.length>80)throw new Error(tr('快捷键需包含至少一个修饰键和一个按键'));
 const parts=value.split('+'),last=parts.pop()||'',key=keys.find(key=>key.toLowerCase()===last.toLowerCase())||({arrowup:'Up',arrowdown:'Down',arrowleft:'Left',arrowright:'Right'} as Record<string,string>)[last.toLowerCase()]||last.toUpperCase();
 const mods=parts.map(part=>aliases[part.toLowerCase()]);
 if(!mods.length||mods.some(mod=>!mod)||new Set(mods).size!==mods.length||!keys.includes(key)&&! /^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(key))throw new Error(tr('快捷键需包含至少一个修饰键和一个按键'));
 return [...modifiers.filter(mod=>mods.includes(mod)),key].join('+');
}
export function shortcutLabel(value:string){return value.replaceAll('Control','Ctrl').replaceAll('Super','Win');}
export function shortcutFromEvent(event:KeyboardEvent):string|undefined{
 const key=event.code.startsWith('Key')?event.code.slice(3):event.code.startsWith('Digit')?event.code.slice(5):event.code==='Space'?'Space':event.key;
 try{return shortcutKey([event.ctrlKey?'Control':'',event.altKey?'Alt':'',event.shiftKey?'Shift':'',event.metaKey?'Super':'',key].filter(Boolean).join('+'));}catch{return undefined;}
}
