import {t as tr} from '../shared/i18n';
import type {CodexStatus} from '../shared/text-tools';
import {ActionScope,setActionDisabled} from './actions';
import {copyTextValue} from './copy-text';
import {icon,iconButton,registerIcons} from './ui';
import {ArrowUpRight} from 'lucide';
registerIcons({'arrow-up-right':ArrowUpRight});
export function codexAccountMarkup(){return `<section class="codex-account" hidden><header><span class="codex-account-icon" aria-hidden="true">${icon('lucide:bot')}</span><div class="codex-account-identity"><strong>${tr('Codex 账户')}</strong><p id="codex-account-detail" hidden></p></div><span id="codex-status" class="codex-status" role="status" aria-live="polite">${tr('正在检查登录…')}</span></header><div class="codex-account-actions"><button id="codex-login" type="button">${tr('登录 Codex')}</button><button id="codex-refresh" type="button" class="quiet">${tr('检查登录')}</button><button id="codex-logout" type="button" class="quiet" hidden>${tr('退出账户')}</button></div><section id="codex-device" class="codex-device" hidden><div class="codex-device-heading"><strong>${tr('完成账户授权')}</strong><button id="codex-cancel-login" type="button" class="quiet">${tr('取消登录')}</button></div><p>${tr('打开授权页面，输入验证码完成登录。')}</p><div class="codex-device-controls"><div class="codex-code"><code id="codex-device-code"></code>${iconButton('codex-copy-code',tr('复制验证码'),'lucide:copy')}</div><button id="codex-open-login" type="button" class="primary">${tr('打开授权页面')}${icon('lucide:arrow-up-right')}</button></div></section></section>`;}
export function bindCodexAccount(root:HTMLElement,toast:(value:unknown)=>void){
 const api=window.clipper,actions=new ActionScope(),q=<T extends HTMLElement=HTMLElement>(id:string)=>root.querySelector<T>('#'+id)!;let timer:ReturnType<typeof setTimeout>|undefined,disposed=false,current:CodexStatus|undefined;
 const live=()=>!disposed&&root.isConnected;
 const apply=(state:CodexStatus)=>{if(!live())return;current=state;const pending=state.login==='pending'||state.login==='starting';q('codex-status').textContent=state.error?tr('连接异常'):(pending?tr('等待授权'):state.loggedIn?tr('已连接'):tr('未连接'));q('codex-status').dataset.state=state.error?'error':pending?'pending':state.loggedIn?'connected':'idle';q('codex-account-detail').textContent=state.error||[state.email,state.planType].filter(Boolean).join(' · ')||tr('登录后使用账户的模型和额度');q('codex-account-detail').hidden=false;q('codex-login').textContent=state.loggedIn?tr('重新登录'):tr('登录 Codex');setActionDisabled(q<HTMLButtonElement>('codex-login'),pending);q('codex-login').hidden=pending;q('codex-refresh').hidden=pending;q('codex-logout').hidden=pending||!state.loggedIn;q('codex-device').hidden=state.login!=='pending';q('codex-device-code').textContent=state.userCode||'';clearTimeout(timer);if(pending)timer=setTimeout(()=>void refresh().catch(toast),3000);};
 const refresh=async()=>{const state=await api.codexStatus();apply(state);return state;};
 actions.bind(q<HTMLButtonElement>('codex-login'),async()=>{apply(await api.codexLogin());},toast);
 actions.bind(q<HTMLButtonElement>('codex-refresh'),refresh,toast);
 actions.bind(q<HTMLButtonElement>('codex-logout'),async()=>{await api.codexLogout();await refresh();},toast);
 actions.bind(q<HTMLButtonElement>('codex-cancel-login'),async()=>{await api.codexCancelLogin();await refresh();},toast);
 actions.bind(q<HTMLButtonElement>('codex-copy-code'),async()=>{if(current?.userCode){await copyTextValue(current.userCode);toast(tr('验证码已复制'));}},toast);
 actions.bind(q<HTMLButtonElement>('codex-open-login'),()=>api.codexOpenLogin(),toast);
 return {refresh,dispose(){disposed=true;clearTimeout(timer);}};
}
