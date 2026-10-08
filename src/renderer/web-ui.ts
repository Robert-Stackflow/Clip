import {createElement,Monitor,Link2,Users,Share2} from 'lucide';
import {utilityEmpty} from './utility-empty';
import {searchField} from './one-search';
import {utilityLayout} from './layout-029';
import {onRemoval} from './controls';
import type {Clip} from '../shared/types';
import {t as tr,formatDate,formatNumber} from '../shared/i18n';
import type {WebState} from '../shared/web-share';
import './web.css';
const api=window.clip,$=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
interface Context {history?():readonly Clip[];active():boolean;toast(value:unknown):void;modal(title:string,body:string,save:()=>Promise<void>,label?:string):void}
export function webUI(ctx:Context){
 let listHTML='',clipGeneration=0;
 let generation=0,last='',search='';const on=(id:string,fn:()=>unknown)=>$(id)?.addEventListener('click',()=>void Promise.resolve().then(fn).catch(ctx.toast));
 async function update(){if(!ctx.active())return;const s=await api.webState();if(!ctx.active()||!$('web-status'))return;if($('web-status').dataset.running!==String(s.running)){await render();return;}await live(s);}
 async function live(s:WebState){$('web-status').dataset.running=String(s.running);$('web-status').textContent=s.running?tr`${formatNumber(s.items.length)} 项内容 · ${formatNumber(s.clients.filter(c=>c.approved).length)} 个浏览器 · ${formatDate(s.expires,{timeStyle:'medium'})} 结束`:tr('尚未开启');$('web-error').textContent=s.error;
  if(!s.running)return;const link=$<HTMLTextAreaElement>('web-link');link.value=s.invitation;link.hidden=!s.invitation;sizeInvite(link);$<HTMLButtonElement>('web-copy-link').disabled=!s.invitation;$('web-invite-expiry').textContent=s.invitation?tr('邀请有效至 ')+formatDate(s.inviteExpires,{timeStyle:'medium'})+tr('，只能使用一次'):tr('邀请已使用或过期，可生成新邀请');$('web-fingerprint').textContent=s.fingerprint.match(/.{2}/g)!.join(':');
  const key=JSON.stringify(s.clients);if(last!==key){last=key;$('web-clients').innerHTML=s.clients.length?s.clients.map(c=>`<article class="sync-device"><div><strong>${esc(c.name)}</strong><p>${esc(c.host)} · ${c.approved?(c.allowSend?tr('可接收与发送'):tr('仅接收')):tr('验证码 ')+c.code+tr(' · 等待确认')}</p></div>${c.approved?tr`<button data-web-revoke="${c.id}">断开连接</button>`:tr`<button data-web-approve="${c.id}">核对并允许</button><button data-web-deny="${c.id}">拒绝</button>`}</article>`).join(''):utilityEmpty(tr('暂无浏览器'),Users).outerHTML;
   document.querySelectorAll<HTMLButtonElement>('[data-web-approve]').forEach(b=>b.onclick=()=>{const c=s.clients.find(c=>c.id===b.dataset.webApprove)!;ctx.modal(tr('允许浏览器连接'),tr`<p><strong>${esc(c.name)}</strong> · ${esc(c.host)}</p><p>确认浏览器显示相同验证码：<strong class="web-code">${c.code}</strong></p><p>允许后，该浏览器可查看本次会话中所有选中内容及之后主动加入的内容。</p><label class="tool-check"><input id="web-allow-send" type="checkbox">同时允许发送文字与图片到本机历史</label>`,()=>api.webApprove(c.id,true,$<HTMLInputElement>('web-allow-send').checked),tr('允许连接'));});
   document.querySelectorAll<HTMLButtonElement>('[data-web-deny]').forEach(b=>b.onclick=()=>void api.webApprove(b.dataset.webDeny!,false,false).catch(ctx.toast));document.querySelectorAll<HTMLButtonElement>('[data-web-revoke]').forEach(b=>b.onclick=()=>void api.webRevoke(b.dataset.webRevoke!).catch(ctx.toast));
  }await clips(s);
 }
 async function clips(s:WebState){const request=++clipGeneration;const state=ctx.history?{clips:ctx.history()}:await api.state();if(request!==clipGeneration||!ctx.active()||!$('web-clips'))return;const selected=new Map(s.items.map(i=>[i.clipId,i.id])),items=state.clips.filter(c=>c.kind!=='files'&&(c.title+' '+c.preview).toLowerCase().includes(search.toLowerCase())).slice(0,100);const html=items.length?items.map(c=>`<article class="sync-device"><div><strong title="${esc(c.title)}">${esc(c.title)}</strong><p>${c.kind==='image'?tr('图片'):tr('文字')} · ${c.localOnly?tr('仅本机'):selected.has(c.id)?tr('正在共享'):tr('未共享')}</p></div><button data-web-clip="${c.id}" ${c.localOnly?'disabled':''} data-web-remove="${selected.get(c.id)||''}">${selected.has(c.id)?tr('撤回'):tr('加入共享')}</button></article>`).join(''):utilityEmpty(tr('没有匹配的文字或图片记录。'),Share2).outerHTML;if(html===listHTML)return;listHTML=html;$('web-clips').innerHTML=html;document.querySelectorAll<HTMLButtonElement>('[data-web-clip]').forEach(b=>b.onclick=()=>void (b.dataset.webRemove?api.webRemove(b.dataset.webRemove):api.webPublish(b.dataset.webClip!)).then(update).catch(ctx.toast));}
 async function render(){const g=++generation,s=await api.webState();if(g!==generation||!ctx.active())return;last='';search='';listHTML='';$('content').innerHTML=tr`<section class="tools-page web-page" data-running="${s.running}">
<div class="page-heading"><div class="web-heading-copy"><h1>网页共享</h1><span id="web-status"></span></div>${s.running?tr('<button id="web-stop" class="primary">结束共享</button>'):''}</div>
<div class="tools-scroll"><p id="web-error" class="sync-error" role="alert"></p>${s.running?tr`
<div class="sharing-layout web-workbench"><section class="web-connections">
<section class="settings-card web-card"><div class="utility-card-heading"><h2>${createElement(Link2,{'class':'icon','aria-hidden':'true'}).outerHTML}邀请浏览器</h2></div>
<textarea id="web-link" rows="2" readonly aria-label="网页邀请链接" spellcheck="false"></textarea><p id="web-invite-expiry" class="field-help"></p>
<div class="sync-pair-row"><button id="web-copy-link">复制邀请链接</button><button id="web-renew" class="quiet">生成新邀请</button></div>
<details class="utility-guide"><summary>共享范围</summary><p class="field-help">全部已批准浏览器可见。文件、仅本机内容与邀请凭证不会共享；编辑、删除或改为仅本机会撤回。接收端已复制或另存的副本无法撤回。最多 100 项。</p></details>
<details class="utility-guide"><summary>连接说明</summary><p class="field-help">在同一局域网打开下面的链接。先在浏览器证书详情中核对 SHA-256，与下方完全一致后再继续访问；页面请求连接后，核对双方验证码并允许。需要允许 Clip 通过 Windows 专用网络防火墙。</p></details>
<details class="utility-guide"><summary>查看本次证书 SHA-256 指纹</summary><code id="web-fingerprint"></code><p class="field-help">每次开启会话都会更换证书。指纹不一致时不要继续访问。</p></details></section>
<section class="settings-card web-card"><div class="utility-card-heading"><h2>${createElement(Users,{'class':'icon','aria-hidden':'true'}).outerHTML}浏览器连接</h2></div><div id="web-clients"></div></section></section>
<section class="settings-card web-content-card"><div class="utility-card-heading"><h2>${createElement(Share2,{'class':'icon','aria-hidden':'true'}).outerHTML}共享内容</h2></div>
<label class="tool-check"><input id="web-follow" type="checkbox" ${s.follow?'checked':''}>持续共享之后新复制的文字与图片</label>
${searchField('web-search',tr('搜索可共享内容'),tr('搜索历史并选择内容'))}<div id="web-clips"></div></section></div>`:tr`
<section class="settings-card web-setup-panel"><div class="web-setup-intro">${createElement(Monitor,{'class':'icon','aria-hidden':'true','stroke-width':1.5}).outerHTML}<h2>开启临时会话</h2><p>选择历史内容，分享给局域网中的浏览器。</p></div>
<label class="field">本机局域网地址<select id="web-host">${s.addresses.map(a=>`<option>${esc(a)}</option>`).join('')}</select></label>
<label class="field">持续时间<select id="web-duration"><option value="15">15 分钟</option><option value="30" selected>30 分钟</option><option value="60">60 分钟</option><option value="120">2 小时</option></select></label>
<button id="web-start" class="primary" ${s.addresses.length?'':'disabled'}>开启网页共享</button>${s.addresses.length?'':tr('<p class="field-help">没有可用的局域网 IPv4 地址，请先连接网络。</p>')}</section>`}</div></section>`;

  utilityLayout('web');const link=$<HTMLTextAreaElement>('web-link');if(link){let width=0;const observer=new ResizeObserver(()=>{const next=link.getBoundingClientRect().width;if(next&&next!==width){width=next;sizeInvite(link);}});observer.observe(link);onRemoval(link,()=>observer.disconnect());}on('web-start',async()=>{await api.webStart({host:$<HTMLSelectElement>('web-host').value,minutes:Number($<HTMLSelectElement>('web-duration').value),follow:false});await render();});on('web-stop',async()=>{await api.webStop();await render();});on('web-renew',()=>api.webInvite());on('web-copy-link',async()=>{await api.webCopyInvite();ctx.toast(tr('邀请链接已复制'));});$('web-follow')?.addEventListener('change',()=>void api.webFollow($<HTMLInputElement>('web-follow').checked).catch(ctx.toast));$('web-search')?.addEventListener('input',()=>{search=$<HTMLInputElement>('web-search').value;void api.webState().then(clips).catch(ctx.toast);});await live(s);
 }
 return {render,update};
}
function sizeInvite(link:HTMLTextAreaElement){if(link.hidden||!link.clientWidth)return;link.style.height='auto';const style=getComputedStyle(link),border=parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth);link.style.height=Math.ceil(link.scrollHeight+border)+'px';}
