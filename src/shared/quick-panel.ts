import {t as tr} from './i18n';
import {shortcutKey} from './shortcut';
import {clampRect,validRect,type Rect} from './desktop';
import type {TrayAPI,TrayState} from './tray';
import type {Kind} from './types';
import type {QuickHoverRect} from './quick-preview';
export const QUICK_SHORTCUT='Control+Alt+V';
export type GlyphTab='emoji'|'kaomoji'|'symbols';
export interface QuickGlyph{tab:GlyphTab;text:string}
export interface QuickState extends TrayState{recent:QuickGlyph[]}
export interface QuickReplyItem{token:string;title:string;preview:string;kind:Kind;thumbnail?:string;variables:string[]}
export interface QuickReplyState{items:QuickReplyItem[];dark:boolean;canPaste:boolean}
export interface QuickAPI extends Omit<TrayAPI,'state'|'drag'>{
 state(query:Parameters<TrayAPI['state']>[0]):Promise<QuickState>;
 text(value:QuickGlyph,paste:boolean):Promise<void>;
 action(token:string,action:'pin'|'favorite'|'delete'):Promise<void>;
 clear():Promise<void>;
 hover(token:string|null,rect?:QuickHoverRect,immediate?:boolean):Promise<void>;
 replies(text:string):Promise<QuickReplyState>;
 reply(token:string,paste:boolean,values?:Record<string,string>):Promise<void>;
 createReply(value:{title:string;text:string}):Promise<void>;
 move():Promise<void>;
}
export const quickShortcut=(value:unknown)=>shortcutKey(value);
export function quickGlyph(value:unknown):QuickGlyph{
 const v=value as QuickGlyph;
 if(!v||!['emoji','kaomoji','symbols'].includes(v.tab)||typeof v.text!=='string'||!v.text.trim()||v.text.length>128||/[\x00-\x1f\x7f]/.test(v.text))throw new Error(tr('表情或符号无效'));
 return {tab:v.tab,text:v.text};
}
export function quickRecent(value:unknown):QuickGlyph[]{
 if(!Array.isArray(value))return [];const result:QuickGlyph[]=[];
 for(const entry of value.slice(0,32))try{const glyph=quickGlyph(entry);if(!result.some(item=>item.tab===glyph.tab&&item.text===glyph.text))result.push(glyph);}catch{}
 return result;
}
export function rememberGlyph(history:unknown,value:unknown){const glyph=quickGlyph(value);return [glyph,...quickRecent(history).filter(item=>item.tab!==glyph.tab||item.text!==glyph.text)].slice(0,32);}
export function quickPanelBounds(point:{x:number;y:number},area:Rect):Rect{
 if(!validRect(area)||!Number.isFinite(point.x)||!Number.isFinite(point.y))throw new Error(tr('面板位置无效'));
 const width=Math.min(400,area.width),height=Math.min(560,area.height);
 return clampRect({x:point.x+12,y:point.y+12,width,height},area,1,1);
}
declare global{interface Window{clipperQuick:QuickAPI}}
