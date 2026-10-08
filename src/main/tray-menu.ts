import type {MenuItemConstructorOptions} from 'electron';
import {t as tr} from '../shared/i18n';
export interface TrayMenuState {initializing:boolean;secured:boolean;stackActive:boolean;paused:boolean;encrypted:boolean;launchAtLogin:boolean}
export interface TrayMenuActions {recent():void;open():void;replies():void;chat():void;shelf():void;stack():void;pause():void;lock():void;startup():void;restart():void;quit():void}
export type TrayMenuAction=keyof TrayMenuActions;
export interface TrayMenuEntry {id:TrayMenuAction;label:string;group:'header'|'primary'|'tools'|'privacy'|'system';icon:string;tone?:'danger';active?:boolean}
export interface TrayMenuView {entries:TrayMenuEntry[];dark:boolean;initializing:boolean;secured:boolean;paused:boolean;stackActive:boolean}
export function trayMenuEntries(state:TrayMenuState):TrayMenuEntry[]{
 const system:TrayMenuEntry[]=[{id:'restart',label:tr('重启 Clip'),group:'system',icon:'rotate-cw'},{id:'quit',label:tr('退出 Clip'),group:'system',icon:'power',tone:'danger'}];
 if(state.initializing)return system;
 if(state.secured)return [
  {id:'open',label:tr('解锁历史'),group:'primary',icon:'lock-open'},
  ...system
 ];
 return [
  {id:'open',label:tr('打开 Clip'),group:'primary',icon:'app-window'},
  {id:'recent',label:tr('最近记录'),group:'primary',icon:'history'},
  {id:'replies',label:tr('快捷回复'),group:'tools',icon:'message-square-text'},
  {id:'chat',label:tr('AI 对话'),group:'tools',icon:'messages-square'},
  {id:'shelf',label:tr('浮动拖放窗口'),group:'tools',icon:'panel-top'},
  {id:'stack',label:state.stackActive?tr('停止自动加入堆栈'):tr('开始自动加入堆栈'),group:'header',icon:'layers-2',active:state.stackActive},
  {id:'pause',label:state.paused?tr('恢复记录'):tr('暂停记录'),group:'header',icon:state.paused?'play':'pause',active:state.paused},
  ...(state.encrypted?[{id:'lock' as const,label:tr('锁定历史'),group:'privacy' as const,icon:'lock-keyhole'}]:[]),
  {id:'startup',label:tr('开机自启动'),group:'system',icon:'monitor',active:state.launchAtLogin},
  ...system
 ];
}
export function trayMenuTemplate(state:TrayMenuState,actions:TrayMenuActions):MenuItemConstructorOptions[]{
 const entries=trayMenuEntries(state),divider=entries.findIndex(item=>item.group==='system');
 return entries.flatMap((item,index)=>index===divider&&!state.secured?[{type:'separator' as const},{label:item.label,click:actions[item.id]}]:[{label:item.label,click:actions[item.id]}]);
}
