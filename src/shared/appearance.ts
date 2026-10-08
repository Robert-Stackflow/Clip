import {t as tr} from './i18n';
import {validFont,fontStack,type UIFont,type InstalledFont,type UIFontSource} from './fonts';
export const appearanceScales=[100,110,125,150] as const;
export interface UIAppearance {font:UIFont;scale:typeof appearanceScales[number];density:'comfortable'|'compact';accent:string;lightBackground:string;darkBackground:string;lightForeground:string;darkForeground:string;radius:number;toastPosition:'top-center'|'top-right'|'top-left'|'bottom-center'|'bottom-right'|'bottom-left'}
export interface AppearanceState {value:UIAppearance;warning:string}
export interface AppearanceAPI {retainFontResources?():void;releaseFontResources?():void;state():Promise<AppearanceState>;installedFonts(refresh?:boolean):Promise<InstalledFont[]>;uiFontSource(family:string):Promise<UIFontSource|null>;onChange(callback:(state:AppearanceState)=>void):()=>void}
export const defaultAppearance=():UIAppearance=>({font:'system',scale:100,density:'comfortable',accent:'#303030',lightBackground:'#ffffff',darkBackground:'#181818',lightForeground:'#202020',darkForeground:'#eeeeee',radius:10,toastPosition:'bottom-center'});
export function validateAppearance(value:unknown):UIAppearance {
 if(!value||typeof value!=='object'||Array.isArray(value)||!('font'in value)||!('scale'in value)||!('density'in value))throw new Error(tr('字体或密度设置无效'));const v={...defaultAppearance(),...value} as UIAppearance;
 if(!validFont(v.font)||!appearanceScales.includes(v.scale)||!['comfortable','compact'].includes(v.density)||!['accent','lightBackground','darkBackground','lightForeground','darkForeground'].every(key=>typeof v[key as keyof UIAppearance]==='string'&&/^#[a-f0-9]{6}$/i.test(v[key as keyof UIAppearance] as string))||!Number.isInteger(v.radius)||v.radius<4||v.radius>16||!['top-center','top-right','top-left','bottom-center','bottom-right','bottom-left'].includes(v.toastPosition))throw new Error(tr('字体或密度设置无效'));
 return {font:v.font,scale:v.scale,density:v.density,accent:v.accent,lightBackground:v.lightBackground,darkBackground:v.darkBackground,lightForeground:v.lightForeground,darkForeground:v.darkForeground,radius:v.radius,toastPosition:v.toastPosition};
}
export const appearanceFonts:Record<'system'|'sans'|'mono',string>={
 system:"'Segoe UI Variable Text','Segoe UI','Microsoft YaHei UI',sans-serif",
 sans:"'Microsoft YaHei UI','Microsoft YaHei','Segoe UI',sans-serif",
 mono:"Consolas,'Cascadia Mono','Microsoft YaHei UI',monospace"
};
export {fontStack};
export function trustedAppearancePage(value:string){try{const url=new URL(value);return url.protocol==='clip:'&&url.host==='app'&&/^\/(?:index|quick|quick-preview|tray|tray-menu|shelf|chat|unlock|recovery)\.html$/.test(url.pathname);}catch{return false;}}
