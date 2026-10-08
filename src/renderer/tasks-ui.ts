import {t as tr,formatNumber,formatDate} from '../shared/i18n';
import {createElement,ListChecks,LoaderCircle,Check,AlertCircle,Upload,Code2,Bot,Copy,RefreshCw,ArrowUpRight,X} from 'lucide';
import {taskActive,type TaskItem,type TaskState} from '../shared/tasks';
const api=window.clip;
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const icon=(node:Parameters<typeof createElement>[0])=>createElement(node,{class:'icon','aria-hidden':'true','stroke-width':1.75}).outerHTML;
interface Context {modal(title:string,body:string,save:()=>Promise<void>,label?:string):void;toast(text:unknown):void;select(id:string):Promise<void>}
export function tasksUI(ctx:Context){
 let state:TaskState={items:[],active:0,failed:0},filter='all',revision=0;
 const label=(item:TaskItem)=>item.status==='completed'?(item.reused?tr('已复用'):tr('已完成')):item.status==='failed'?tr('失败'):item.status==='cancelled'?tr('已取消'):item.status==='queued'?tr('等待中'):tr('处理中');
 const button=(action:string,title:string,id:string,primary=false)=>`<button type="button" class="${primary?'primary':'quiet'}" data-task-action="${action}" data-task-id="${esc(id)}" ${primary?'':`aria-label="${title}" title="${title}"`}>${icon(action==='copy'?Copy:action==='record'?ArrowUpRight:action==='cancel'?X:RefreshCw)}${primary?`<span>${title}</span>`:''}</button>`;
 function sidebar(){
  const node=document.getElementById('task-center');if(!node)return;
  const glyph=state.active?LoaderCircle:state.failed?AlertCircle:ListChecks;
  node.dataset.state=state.active?'busy':state.failed?'error':'idle';
  node.setAttribute('aria-haspopup','dialog');node.setAttribute('aria-expanded',String(!!document.querySelector('.tasks-dialog[open]')));
  node.innerHTML=`<span class="task-entry-icon">${icon(glyph)}</span><span class="task-entry-copy"><strong>${tr('任务中心')}</strong></span><span class="task-entry-count">${formatNumber(state.active||state.failed||state.items.length)}</span>`;
  node.title=tr('任务中心')+' · '+formatNumber(state.active)+tr('个处理中');node.onclick=open;
 }
 function list(){
  const root=document.getElementById('task-list');if(!root)return;
  const visible=state.items.filter(item=>filter==='all'||filter==='active'&&taskActive(item)||filter==='failed'&&(item.status==='failed'||item.status==='cancelled')||filter==='completed'&&item.status==='completed');
  const top=root.scrollTop,focused=document.activeElement as HTMLElement,focusId=focused?.dataset.taskId,focusAction=focused?.dataset.taskAction;
  root.innerHTML=visible.length?visible.map(item=>{
   const glyph=item.kind==='script'?Code2:item.kind==='ai'?Bot:Upload;
   const actions=(taskActive(item)?button('cancel',tr('取消'),item.id):item.retryable&&['failed','cancelled'].includes(item.status)?button('retry',tr('重试'),item.id,true):'')+(!taskActive(item)&&item.kind==='image-upload'&&item.recordId?button('reupload',tr('重新上传'),item.id):'')+(item.conversationId?button('conversation',tr('查看对话'),item.id):'')+(item.recordId?button('record',tr('查看记录'),item.id):'');
   const kind=item.kind==='script'?tr('文本脚本'):item.kind==='ai'?tr('AI 文本处理'):item.kind==='image-test'?tr('图床测试'):tr('图片上传');
   return `<article class="task-row" data-status="${item.status}"><div class="task-row-heading"><span class="task-row-icon">${icon(glyph)}</span><div class="task-row-identity"><strong title="${esc(item.title)}">${esc(item.title)}</strong><div class="task-row-meta"><span>${kind}</span><i>·</i><time>${formatDate(item.createdAt,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time></div></div><span class="task-state">${icon(item.status==='completed'?Check:item.status==='failed'?AlertCircle:taskActive(item)?LoaderCircle:X)}${label(item)}</span><div class="task-row-actions">${actions}</div></div>${item.status==='failed'||taskActive(item)?`<p class="task-phase">${esc(item.error||item.phase)}</p>`:item.link?`<p class="task-completion-note">${esc(item.reused?tr('复用已上传的图片'):item.copied?tr('链接已复制'):tr('链接可复制'))}</p>`:''}${item.link?`<div class="task-result-link"><span class="task-link-mark">${icon(Copy)}</span><code class="task-link" title="${esc(item.link)}">${esc(item.link)}</code>${button('copy',tr('复制链接'),item.id,true)}</div>`:''}${taskActive(item)?'<div class="task-running-line"></div>':''}</article>`;
  }).join(''):`<div class="task-empty">${icon(Check)}<strong>${tr('这里还没有任务')}</strong><p>${tr('上传图片和文本处理会显示在这里。')}</p></div>`;
  root.scrollTop=top;
  if(focusId&&focusAction)root.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(focusId)}"][data-task-action="${focusAction}"]`)?.focus({preventScroll:true});
  root.querySelectorAll<HTMLButtonElement>('[data-task-action]').forEach(node=>node.onclick=()=>{node.disabled=true;void(async()=>{
   const id=node.dataset.taskId!,action=node.dataset.taskAction!;
   if(action==='cancel')await api.cancelTask(id);
   if(action==='retry')await api.retryTask(id);
   if(action==='reupload'){const item=state.items.find(item=>item.id===id);if(item?.recordId)await api.startImageUpload(item.recordId,true);}
   if(action==='copy'){await api.copyTaskLink(id);ctx.toast(tr('图片链接已复制'));}
   if(action==='conversation'){const item=state.items.find(item=>item.id===id);document.querySelector<HTMLDialogElement>('#dialog')!.close();if(item?.conversationId)await api.openChat(item.conversationId);}
   if(action==='record'){const item=state.items.find(item=>item.id===id);document.querySelector<HTMLDialogElement>('#dialog')!.close();if(item?.recordId)await ctx.select(item.recordId);}
  })().catch(ctx.toast).finally(()=>node.disabled=false);});
  const summary=document.getElementById('task-summary');if(summary)summary.innerHTML=[[tr('处理中'),state.active,LoaderCircle],[tr('已完成'),state.items.filter(item=>item.status==='completed').length,Check],[tr('失败'),state.failed,AlertCircle]].map(([label,count,glyph])=>`<span title="${label}: ${count}" aria-label="${label}: ${count}">${icon(glyph as typeof Check)}<span class="task-stat-label">${label}</span><b>${formatNumber(count as number)}</b></span>`).join('');
 }
 function open(){
  filter='all';ctx.modal(tr('任务中心'),`<div class="task-toolbar"><div class="task-filters tabs" role="group" aria-label="${tr('任务状态')}">${[['all',tr('全部')],['active',tr('处理中')],['completed',tr('已完成')],['failed',tr('需处理')]].map(([key,label])=>`<button type="button" data-task-filter="${key}" class="${key==='all'?'active':''}" aria-pressed="${key==='all'}">${label}</button>`).join('')}</div><div id="task-summary" class="task-summary"></div></div><div id="task-list" class="task-list" aria-live="polite"></div>`,async()=>{},tr('关闭'));
  const dialog=document.getElementById('dialog') as HTMLDialogElement;dialog.classList.add('tasks-dialog');sidebar();dialog.addEventListener('close',()=>{dialog.classList.remove('tasks-dialog');sidebar();},{once:true});dialog.querySelector<HTMLElement>('#modal-cancel')!.hidden=true;
  const clear=document.createElement('button');clear.type='button';clear.className='quiet task-clear';clear.textContent=tr('清除已结束任务');dialog.querySelector('.modal-footer')!.prepend(clear);clear.onclick=()=>void api.clearTasks().catch(ctx.toast);
  dialog.querySelectorAll<HTMLButtonElement>('[data-task-filter]').forEach(node=>node.onclick=()=>{filter=node.dataset.taskFilter!;dialog.querySelectorAll<HTMLElement>('[data-task-filter]').forEach(other=>{other.classList.toggle('active',other===node);other.setAttribute('aria-pressed',String(other===node));});list();});list();
  void load();
 }
 const changed=(value:TaskState)=>{revision++;state=value;sidebar();list();};
 async function load(){const before=revision;try{const value=await api.tasks();if(value&&revision===before)changed(value);}catch{/* The sidebar stays available while the main window reconnects. */}}
 api.onTasks?.(changed);
 return {mount:()=>{sidebar();void load();},open};
}
