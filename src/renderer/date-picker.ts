import {createElement,CalendarDays,ChevronLeft,ChevronRight,type IconNode} from 'lucide';
import {t as tr} from '../shared/i18n';
import {openAnchoredPopover,closeAnchoredPopover} from './anchored-popover';
import {onRemoval} from './controls';
const glyph=(node:IconNode)=>createElement(node,{'class':'icon lucide','aria-hidden':'true','focusable':'false','stroke-width':1.75}).outerHTML;

const escapeHTML=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const dateKey=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const parsedDate=(value:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const [year,month,day]=value.split('-').map(Number),date=new Date(year,month-1,day);return dateKey(date)===value?date:null;};
const dateLabel=(value:string)=>value?value.replaceAll('-','/'):tr('年 / 月 / 日');

export function dateField(options:{id?:string;filter?:'from'|'to';value?:string;label:string}){
 const value=parsedDate(options.value||'')?options.value||'':'';
 return `<span class="clipper-date-field"><input type="hidden" ${options.id?`id="${escapeHTML(options.id)}"`:''} ${options.filter?`data-filter-date="${options.filter}"`:''} value="${escapeHTML(value)}"><button type="button" class="clipper-date-trigger" aria-label="${escapeHTML(options.label)}" aria-haspopup="dialog" aria-expanded="false"><span class="clipper-date-value">${escapeHTML(dateLabel(value))}</span>${glyph(CalendarDays)}</button></span>`;
}

let active:{trigger:HTMLButtonElement;input:HTMLInputElement;popover:HTMLElement;month:Date}|undefined;
let retiring:HTMLElement|undefined;
function closeCalendar(focus=false){
 const current=active;if(!current)return;active=undefined;
 document.removeEventListener('pointerdown',outsideCalendar,true);
 document.removeEventListener('keydown',calendarKeydown,true);
 window.removeEventListener('resize',repositionCalendar);
 window.removeEventListener('scroll',scrollCalendar,true);
 current.trigger.setAttribute('aria-expanded','false');
 retiring?.remove();retiring=current.popover;current.popover.inert=true;current.popover.setAttribute('aria-hidden','true');
 const retired=()=>{if(!current.popover.matches(':popover-open')){current.popover.removeEventListener('toggle',retired);current.popover.remove();if(retiring===current.popover)retiring=undefined;}};current.popover.addEventListener('toggle',retired);
 closeAnchoredPopover(current.popover);
 if(!current.popover.matches(':popover-open'))current.popover.remove();
 if(focus&&current.trigger.isConnected)current.trigger.focus({preventScroll:true});
}
function outsideCalendar(event:PointerEvent){if(event.target instanceof Element&&event.target.closest('.select-popup'))return;if(active&&!active.popover.contains(event.target as Node)&&!active.trigger.contains(event.target as Node))closeCalendar();}
function calendarKeydown(event:KeyboardEvent){if(event.key==='Escape'&&active){event.preventDefault();event.stopImmediatePropagation();closeCalendar(true);}}
function scrollCalendar(event:Event){if(active&&event.target!==active.popover&&!active.popover.contains(event.target as Node))closeCalendar();}
function repositionCalendar(){if(active)openAnchoredPopover(active.popover,active.trigger,284,380);}
function chooseDate(value:string){
 const current=active;if(!current)return;closeCalendar();current.input.value=value;
 current.trigger.querySelector('.clipper-date-value')!.textContent=dateLabel(value);
 current.input.dispatchEvent(new Event('change',{bubbles:true}));
 if(current.trigger.isConnected)current.trigger.focus({preventScroll:true});
}
function drawCalendar(){
 const current=active;if(!current)return;const {popover,month,input}=current,locale=document.documentElement.lang||'zh-CN',year=month.getFullYear(),index=month.getMonth(),today=dateKey(new Date()),selected=input.value;
 const weekdays=Array.from({length:7},(_,day)=>new Intl.DateTimeFormat(locale,{weekday:'short'}).format(new Date(2024,0,1+day)));
 const first=(new Date(year,index,1).getDay()+6)%7,monthNames=Array.from({length:12},(_,i)=>new Intl.DateTimeFormat(locale,{month:'long'}).format(new Date(2024,i,1)));
 const years=Array.from({length:132},(_,i)=>1970+i);
 const days=Array.from({length:42},(_,i)=>{const date=new Date(year,index,1+i-first),value=dateKey(date),label=new Intl.DateTimeFormat(locale,{year:'numeric',month:'long',day:'numeric'}).format(date);return `<button type="button" class="clipper-calendar-day ${date.getMonth()===index?'':'outside'} ${value===today?'today':''} ${value===selected?'selected':''}" data-calendar-day="${value}" aria-label="${escapeHTML(label)}" aria-pressed="${value===selected}">${date.getDate()}</button>`;}).join('');
 popover.innerHTML=`<div class="clipper-calendar-header"><button type="button" class="clipper-calendar-nav" data-calendar-step="-1" aria-label="${tr('上个月')}">${glyph(ChevronLeft)}</button><div class="clipper-calendar-month"><select data-calendar-year aria-label="${tr('年份')}">${years.map(y=>`<option value="${y}" ${y===year?'selected':''}>${y}</option>`).join('')}</select><select data-calendar-month aria-label="${tr('月份')}">${monthNames.map((name,i)=>`<option value="${i}" ${i===index?'selected':''}>${escapeHTML(name)}</option>`).join('')}</select></div><button type="button" class="clipper-calendar-nav" data-calendar-step="1" aria-label="${tr('下个月')}">${glyph(ChevronRight)}</button></div><div class="clipper-calendar-weekdays">${weekdays.map(day=>`<span>${escapeHTML(day)}</span>`).join('')}</div><div class="clipper-calendar-days">${days}</div><footer class="clipper-calendar-footer"><button type="button" data-calendar-clear>${tr('清除')}</button><button type="button" data-calendar-today>${tr('今天')}</button></footer>`;
 popover.querySelectorAll<HTMLButtonElement>('[data-calendar-step]').forEach(button=>button.onclick=()=>{current.month=new Date(year,index+Number(button.dataset.calendarStep),1);drawCalendar();repositionCalendar();});
 for(const field of ['year','month'] as const)popover.querySelector<HTMLSelectElement>(`[data-calendar-${field}]`)!.onchange=()=>{const y=Number(popover.querySelector<HTMLSelectElement>('[data-calendar-year]')!.value),m=Number(popover.querySelector<HTMLSelectElement>('[data-calendar-month]')!.value);current.month=new Date(y,m,1);drawCalendar();repositionCalendar();};
 popover.querySelectorAll<HTMLButtonElement>('[data-calendar-day]').forEach(button=>button.onclick=()=>chooseDate(button.dataset.calendarDay!));
 popover.querySelector<HTMLButtonElement>('[data-calendar-clear]')!.onclick=()=>chooseDate('');
 popover.querySelector<HTMLButtonElement>('[data-calendar-today]')!.onclick=()=>chooseDate(today);
}
function openCalendar(trigger:HTMLButtonElement){
 if(active?.trigger===trigger){closeCalendar(true);return;}closeCalendar();retiring?.remove();retiring=undefined;
 const field=trigger.closest<HTMLElement>('.clipper-date-field')!,input=field.querySelector<HTMLInputElement>('input')!,date=parsedDate(input.value)||new Date(),popover=document.createElement('div');
 popover.className='clipper-calendar clipper-popover';popover.id='clipper-calendar-popup';popover.setAttribute('popover','manual');popover.setAttribute('role','dialog');popover.setAttribute('aria-label',trigger.getAttribute('aria-label')||tr('选择日期'));field.append(popover);
 active={trigger,input,popover,month:new Date(date.getFullYear(),date.getMonth(),1)};
 trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-controls',popover.id);drawCalendar();repositionCalendar();onRemoval(trigger,()=>{if(active?.trigger===trigger)closeCalendar();});
 document.addEventListener('pointerdown',outsideCalendar,true);document.addEventListener('keydown',calendarKeydown,true);
 window.addEventListener('resize',repositionCalendar);window.addEventListener('scroll',scrollCalendar,true);
 popover.querySelector<HTMLButtonElement>(`[data-calendar-day="${dateKey(date)}"]`)?.focus({preventScroll:true});
}
export function bindDatePickers(root:ParentNode|null|undefined){
 if(active&&!active.trigger.isConnected)closeCalendar();
 if(!root)return;
 root.querySelectorAll<HTMLButtonElement>('.clipper-date-trigger').forEach(button=>button.onclick=()=>openCalendar(button));
}
export function closeDatePickers(root:ParentNode){if(active&&root.contains(active.trigger))closeCalendar();}
