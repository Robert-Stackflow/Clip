import type {MenuItemConstructorOptions} from 'electron';
import {t as tr} from '../shared/i18n';
export interface TrayMenuState {secured:boolean;stackActive:boolean;paused:boolean;encrypted:boolean}
export interface TrayMenuActions {recent():void;open():void;quick():void;replies():void;shelf():void;record():void;stack():void;pause():void;lock():void;quit():void}
export function trayMenuTemplate(state:TrayMenuState,actions:TrayMenuActions):MenuItemConstructorOptions[]{
 if(state.secured)return [{label:tr('解锁历史'),click:actions.open},{label:tr('退出 Clipper'),click:actions.quit}];
 return [{label:tr('最近记录'),click:actions.recent},{label:tr('打开 Clipper'),click:actions.open},{label:tr('快速粘贴'),click:actions.quick},{label:tr('快捷回复'),click:actions.replies},{label:tr('浮动拖放窗口'),click:actions.shelf},{label:tr('录屏与录音'),click:actions.record},{label:state.stackActive?tr('停止自动加入堆栈'):tr('开始自动加入堆栈'),click:actions.stack},{type:'separator'},{label:state.paused?tr('恢复记录'):tr('暂停记录'),click:actions.pause},...(state.encrypted?[{label:tr('锁定历史'),click:actions.lock}]:[]),{label:tr('退出 Clipper'),click:actions.quit}];
}
