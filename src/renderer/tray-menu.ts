import {createElement,History,AppWindow,MessageSquareText,MessagesSquare,PanelTop,Layers2,Pause,Play,LockKeyhole,LockKeyholeOpen,Monitor,Power,RotateCw,Check,type IconNode} from 'lucide';
import {t as tr} from '../shared/i18n';
import type {TrayMenuAction,TrayMenuEntry,TrayMenuView} from '../main/tray-menu';
import type {TrayMenuAPI} from '../preload/tray-menu';
import './locale';
import './appearance';
import './tray-menu.css';

declare global {interface Window {clipTrayMenu:TrayMenuAPI}}
const api=window.clipTrayMenu;
const icons:Record<string,IconNode>={history:History,'app-window':AppWindow,'message-square-text':MessageSquareText,'messages-square':MessagesSquare,'panel-top':PanelTop,'layers-2':Layers2,pause:Pause,play:Play,'lock-keyhole':LockKeyhole,'lock-open':LockKeyholeOpen,monitor:Monitor,power:Power,'rotate-cw':RotateCw};
const root=document.getElementById('menu-items')!,status=document.getElementById('menu-status')!,headerActions=document.getElementById('menu-header-actions')!;
const heading=document.querySelector<HTMLElement>('.menu-heading')!;
let sizingFrame=0,lastHeight=0;
function fit(){
 if(sizingFrame)return;
 sizingFrame=requestAnimationFrame(()=>{
  sizingFrame=0;
  const bodyStyle=getComputedStyle(document.body),rootStyle=getComputedStyle(root),number=(value:string)=>parseFloat(value)||0;
  // Measure the sections themselves so a tall viewport cannot become permanent empty space.
  const sections=[...root.children].reduce((sum,section)=>sum+section.getBoundingClientRect().height,0);
  const height=Math.ceil(heading.getBoundingClientRect().height+sections+number(rootStyle.paddingTop)+number(rootStyle.paddingBottom)+number(bodyStyle.borderTopWidth)+number(bodyStyle.borderBottomWidth));
  if(height===lastHeight)return;lastHeight=height;void api.ready(height).catch(()=>{lastHeight=0;});
 });
}
const sizing=new ResizeObserver(fit);
function render(view:TrayMenuView){
 document.documentElement.dataset.theme=view.dark?'dark':'light';
 status.textContent=view.initializing?tr('正在启动'):view.secured?tr('历史已锁定'):view.paused?tr('已暂停'):tr('自动记录');headerActions.hidden=view.initializing||view.secured;
 for(const id of ['stack','pause'] as const){const entry=view.entries.find(item=>item.id===id),button=document.getElementById('menu-'+id) as HTMLButtonElement;button.disabled=false;button.title=entry?.label||'';button.setAttribute('aria-label',entry?.label||'');button.setAttribute('aria-pressed',String(!!entry?.active));button.replaceChildren(entry?createElement(icons[entry.icon],{'aria-hidden':'true','stroke-width':1.75}):document.createTextNode(''));}
 const groups=new Map<TrayMenuEntry['group'],HTMLElement>();sizing.disconnect();root.replaceChildren();lastHeight=0;
 for(const entry of view.entries){if(entry.group==='header')continue;let group=groups.get(entry.group);if(!group){group=document.createElement('section');group.className='menu-section';group.dataset.group=entry.group;groups.set(entry.group,group);root.append(group);}
  const button=document.createElement('button');button.type='button';button.className='menu-item';button.setAttribute('role','menuitem');button.dataset.action=entry.id;if(entry.tone)button.dataset.tone=entry.tone;if(entry.active)button.dataset.active='true';button.setAttribute('aria-label',entry.label);
  const glyph=createElement(icons[entry.icon]||AppWindow,{'aria-hidden':'true','stroke-width':1.75});glyph.classList.add('menu-icon');const name=document.createElement('span');name.className='menu-item-label';name.textContent=entry.label;button.append(glyph,name);if(entry.active){const active=createElement(Check,{'aria-hidden':'true','stroke-width':2});active.classList.add('menu-active-check');button.append(active);}group.append(button);
 }
 sizing.observe(heading);for(const group of groups.values())sizing.observe(group);fit();
}
document.addEventListener('click',event=>{const button=event.target instanceof Element?event.target.closest<HTMLButtonElement>('[data-action]'):null;if(!button||button.disabled||(!root.contains(button)&&!headerActions.contains(button)))return;button.disabled=true;const id=button.dataset.action as TrayMenuAction;void api.action(id).then(()=>{button.disabled=false;},()=>{button.disabled=false;});});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();void api.hide();return;}if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...root.querySelectorAll<HTMLButtonElement>('.menu-item')];if(!buttons.length)return;const index=buttons.indexOf(document.activeElement as HTMLButtonElement),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowDown'?(index+1)%buttons.length:(index+buttons.length-1)%buttons.length;buttons[next].focus();});
document.addEventListener('contextmenu',event=>event.preventDefault());
api.onChange(()=>void api.state().then(render));
void api.state().then(render);
