import {utilityLayout} from './layout-029';
import {sectionLayout} from './page-layout';
import {createElement,Monitor,Plus,Share2,Radio} from 'lucide';
import {utilityEmpty} from './utility-empty';
import type {Clip} from '../shared/types';
import {t as tr,formatDate,formatNumber} from '../shared/i18n';
import type {SyncState} from '../shared/sync';
import './sync.css';
const api=window.clip,$=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
interface Context {history?():readonly Clip[];active():boolean;toast(value:unknown):void;modal(title:string,body:string,save:()=>Promise<void>,label?:string):void}
export function syncUI(ctx:Context){
 let listHTML='',clipGeneration=0;
 let generation=0;const on=(id:string,fn:()=>unknown)=>$(id)?.addEventListener('click',()=>void Promise.resolve().then(fn).catch(ctx.toast));
 function live(s:SyncState){if(!$('sync-live'))return;$('sync-summary').textContent=tr`${s.enabled?tr('已启用'):tr('已关闭')} · ${formatNumber(s.shared)} 项共享 · ${formatNumber(s.peers.length)} 台配对设备`;$<HTMLButtonElement>('sync-refresh').disabled=!s.enabled;$('sync-live').innerHTML=tr`${s.error?`<p class="sync-error" role="alert">${esc(s.error)}</p>`:''}
<div class="sync-device-grid"><section class="settings-card"><div class="utility-card-heading"><h3>${createElement(Monitor,{'class':'icon','aria-hidden':'true'}).outerHTML}配对设备</h3></div>
${s.peers.length?s.peers.map(p=>tr`<article class="sync-device"><div><strong>${esc(p.name)}</strong><p>${esc(p.host)}:${p.port} · ${p.busy?tr('正在同步'):p.lastSync?tr('最近同步 ')+formatDate(p.lastSync,{timeStyle:'medium'}):tr('等待同步')}</p>${p.error?`<p class="sync-error">${esc(p.error)}</p>`:''}</div><button class="quiet" data-revoke="${p.id}">撤销信任</button></article>`).join(''):utilityEmpty(tr('尚未配对设备'),Monitor).outerHTML}
${s.pending.map(p=>tr`<article class="sync-request"><strong>${esc(p.name)} 请求配对</strong><p>${esc(p.host)} · 指纹 ${esc(p.fingerprint.slice(0,16))}…</p><button data-approve="${p.id}" class="primary">允许配对</button><button data-deny="${p.id}">拒绝</button></article>`).join('')}
${s.joining?tr`<p class="field-help">等待 ${esc(s.joining)} 确认配对… <button id="sync-cancel-join">取消</button></p>`:''}</section>
<section class="settings-card"><div class="utility-card-heading"><h3>${createElement(Radio,{'class':'icon','aria-hidden':'true'}).outerHTML}附近的 Clip</h3></div>${s.nearby.length?s.nearby.map(p=>`<div class="sync-nearby"><strong>${esc(p.name)}</strong><span>${esc(p.host)}:${p.port}</span></div>`).join(''):utilityEmpty(tr('暂无附近设备'),Radio).outerHTML}</section></div>`;

  document.querySelectorAll<HTMLElement>('#sync-live .sync-device strong,#sync-live .sync-nearby strong').forEach(node=>node.title=node.textContent||'');
  $<HTMLButtonElement>('sync-refresh').onclick=()=>void api.syncNow().catch(ctx.toast);on('sync-cancel-join',()=>api.syncCancel());document.querySelectorAll<HTMLButtonElement>('[data-approve]').forEach(b=>b.onclick=()=>void api.syncApprove(b.dataset.approve!,true).catch(ctx.toast));document.querySelectorAll<HTMLButtonElement>('[data-deny]').forEach(b=>b.onclick=()=>void api.syncApprove(b.dataset.deny!,false).catch(ctx.toast));document.querySelectorAll<HTMLButtonElement>('[data-revoke]').forEach(b=>b.onclick=()=>ctx.modal(tr('撤销设备信任'),tr('<p>该设备将不能继续同步。两端已经接收的内容仍保留；重新连接需要再次配对。</p>'),()=>api.syncRevoke(b.dataset.revoke!),tr('撤销信任')));
  if($('sync-invitation')){$<HTMLTextAreaElement>('sync-invitation').value=s.invitation;$('sync-code-area').hidden=!s.invitation;$('sync-expiry').textContent=s.invitation?tr('有效至 ')+formatDate(s.expires,{timeStyle:'medium'})+tr('，仅使用一次'):'';}
 }
 async function update(){if(!ctx.active())return;const s=await api.syncState();if(ctx.active())live(s);}
 async function render(){const token=++generation,s=await api.syncState();if(token!==generation||!ctx.active())return;
  listHTML='';$('content').innerHTML=tr`<section class="tools-page sync-page"><div class="page-heading"><div class="sync-heading-copy"><h1>局域网同步</h1><span id="sync-summary"></span></div><button id="sync-refresh" class="primary" ${s.enabled?'':'disabled'}>立即同步</button></div><div class="tools-scroll">
<h2 id="sync-overview" class="section-label">设备与同步</h2>
<div class="settings-card sync-identity-card"><div class="sync-local-row"><label for="sync-name">设备名称</label><input id="sync-name" maxlength="60" value="${esc(s.name)}"></div></div>
<div class="settings-card sync-settings-card">
<div class="sync-local-row"><div><strong>局域网同步</strong></div><label class="switch"><input id="sync-enabled" type="checkbox" role="switch" aria-label="启用局域网同步" ${s.enabled?'checked':''}><span class="switch-track"></span></label></div>
<div class="sync-local-row"><div><strong>自动共享文字与图片</strong><p>仅共享开启后新复制的内容</p></div><label class="switch"><input id="sync-auto" type="checkbox" role="switch" aria-label="自动同步之后新复制的文字与图片" ${s.autoNew?'checked':''}><span class="switch-track"></span></label></div>
<div class="sync-local-row"><div><strong>自动共享文件与附件</strong><p>发送文件副本，每组最多 12 MiB</p></div><label class="switch"><input id="sync-auto-files" type="checkbox" role="switch" aria-label="自动共享之后新复制的文件与附件" ${s.autoFiles?'checked':''}><span class="switch-track"></span></label></div>
<div class="sync-settings-footer"><p class="sync-note">接收内容只加入历史，不会自动粘贴。源文件路径、设置和密钥不会发送。</p>
<button id="sync-save" class="primary">保存同步设置</button></div></div>
<div id="sync-live"></div>
<h2 id="sync-pair-heading" class="section-label">添加设备</h2>
<p class="sync-note">两台电脑需连接同一局域网。使用一次性配对码连接，并核对设备名称。Windows 防火墙需允许 Clip 访问专用网络。</p>
<div class="sync-pair-grid"><section class="settings-card"><h3>在本机生成配对码</h3><div class="sync-pair-row"><select id="sync-address" aria-label="本机地址">${s.addresses.map(a=>`<option>${esc(a)}</option>`).join('')}</select><button id="sync-create" ${s.enabled&&s.addresses.length?'':'disabled'}>生成配对码</button></div><div id="sync-code-area" hidden><textarea id="sync-invitation" readonly rows="3" aria-label="本机配对码"></textarea><p id="sync-expiry" class="field-help"></p><div class="sync-pair-row"><button id="sync-select-code">选中配对码</button><button id="sync-cancel-code">取消配对码</button></div></div></section>
<section class="settings-card"><h3>连接另一台设备</h3><label class="field">另一台设备的配对码<textarea id="sync-join-code" rows="3" maxlength="4096" placeholder="clip-pair:…" spellcheck="false"></textarea></label><button id="sync-join" ${s.enabled?'':'disabled'}>请求配对</button></section></div>
<h2 id="sync-content-heading" class="section-label">共享内容</h2>
<p class="sync-note">选择记录后共享。共享记录不受自动清理影响，手动删除会同步到配对设备；离线编辑产生的不同版本会分别保留。</p>
<div id="sync-clips"></div></div></section>`;
  sectionLayout($('content').querySelector<HTMLElement>('.tools-scroll')!,[tr('设备与同步'),tr('添加设备'),tr('共享内容')],[$('sync-overview'),$('sync-pair-heading'),$('sync-content-heading')],'sync-section',{icons:[Monitor,Plus,Share2]});
  utilityLayout('sync');live(s);on('sync-save',async()=>{await api.syncConfigure({name:$<HTMLInputElement>('sync-name').value,enabled:$<HTMLInputElement>('sync-enabled').checked,autoNew:$<HTMLInputElement>('sync-auto').checked,autoFiles:$<HTMLInputElement>('sync-auto-files').checked});await render();ctx.toast(tr('同步设置已保存'));});on('sync-create',async()=>{await api.syncInvite($<HTMLSelectElement>('sync-address').value);await update();});on('sync-select-code',()=>{$<HTMLTextAreaElement>('sync-invitation').focus();$<HTMLTextAreaElement>('sync-invitation').select();});on('sync-cancel-code',()=>api.syncCancel());on('sync-join',async()=>{await api.syncJoin($<HTMLTextAreaElement>('sync-join-code').value.trim());$<HTMLTextAreaElement>('sync-join-code').value='';await update();});await clips();
 }
 async function clips(){const request=++clipGeneration;const state=ctx.history?{clips:ctx.history()}:await api.state();if(request!==clipGeneration||!ctx.active()||!$('sync-clips'))return;const list=state.clips.slice(0,100);const html=list.length?list.map(c=>`<article class="sync-device"><div><strong title="${esc(c.title)}">${esc(c.title)}</strong><p>${c.localOnly?tr('仅本机'):c.shared?tr('已共享'):tr('尚未共享')} · ${esc(c.source)}</p></div><div>${c.localOnly?tr`<button data-allow="${c.id}">允许共享</button>`:tr`${!c.shared?tr`<button data-share="${c.id}">${c.kind==='files'?tr('共享文件副本'):tr('共享此条')}</button>`:''}<button data-local="${c.id}">仅本机</button>`}</div></article>`).join(''):tr('<p class="field-help">复制文字、图片或文件后，可在这里选择共享。最多展示最近 100 条。</p>');if(html===listHTML)return;listHTML=html;$('sync-clips').innerHTML=html;const act=(key:string,fn:(id:string)=>Promise<void>)=>document.querySelectorAll<HTMLButtonElement>('[data-'+key+']').forEach(b=>b.onclick=()=>{b.disabled=true;void fn(b.dataset[key]!).then(clips).catch(ctx.toast).finally(()=>{if(b.isConnected)b.disabled=false;});});act('share',id=>api.syncShare(id));act('allow',id=>api.syncLocal(id,false));act('local',async id=>{ctx.modal(tr('将内容设为仅本机'),tr('<p>保留本机记录，撤回已经同步的发布；之后复制相同内容也不会自动共享。其他设备保存的备份不受影响。</p>'),async()=>{await api.syncLocal(id,true);await clips();},tr('设为仅本机'));});}
 return {render,update:async()=>{await update();await clips();}};
}
