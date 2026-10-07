import {t as tr,formatDate} from '../shared/i18n';
import type {API,ImageHostInput,ImageHostState,ImageHostResult} from '../shared/types';
import {copyTextValue} from './copy-text';
import {normalizeSettingItems} from './settings-layout';

const escapeHTML=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));

function input(root:HTMLElement,id:string){return root.querySelector<HTMLInputElement>('#'+id)!;}
function select(root:HTMLElement,id:string){return root.querySelector<HTMLSelectElement>('#'+id)!;}

function draft(root:HTMLElement,state:ImageHostState):ImageHostInput{
  const token=input(root,'image-host-token').value;
  return {
    enabled:input(root,'image-host-enabled').checked,
    endpoint:input(root,'image-host-endpoint').value,
    token:input(root,'image-host-clear-token')?.checked?'':token||undefined,
    bodyMode:select(root,'image-host-body-mode').value as ImageHostInput['bodyMode'],
    fieldName:input(root,'image-host-field-name').value,
    authMode:select(root,'image-host-auth-mode').value as ImageHostInput['authMode'],
    tokenHeader:input(root,'image-host-token-header').value,
    responsePath:input(root,'image-host-response-path').value,
    linkFormat:select(root,'image-host-link-format').value as ImageHostInput['linkFormat'],
    timeoutSeconds:Number(input(root,'image-host-timeout').value),
  };
}

function render(root:HTMLElement,state:ImageHostState){
  const checked=(value:boolean)=>value?'checked':'';
  const option=(value:string,current:string,label:string)=>`<option value="${value}" ${value===current?'selected':''}>${label}</option>`;
  const last=state.lastTest;
  const status=last
    ? `<span class="image-host-result" data-ok="${last.ok}"><i></i>${escapeHTML(last.ok?tr('连接正常'):last.message)}</span><small>${formatDate(last.at,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</small>`
    : `<span class="image-host-result"><i></i>${tr('尚未测试')}</span>`;
  root.innerHTML=`
    <div class="image-host-overview">
      <header class="settings-card-heading"><h3>${tr('图片托管')}</h3></header>
      <div class="image-host-overview-copy"><strong>${tr('启用图片托管')}</strong><p>${tr('按需上传图片，并把服务返回的链接复制为 URL、Markdown 或 HTML。')}</p></div>
      <label class="switch image-host-switch" title="${tr('启用图片托管')}"><input id="image-host-enabled" type="checkbox" role="switch" aria-label="${tr('启用图片托管')}" ${checked(state.enabled)}><span></span></label>
      <div class="image-host-status settings-card-footer">${status}</div>
    </div>
    <section class="image-host-card">
      <header><div><h3>${tr('连接与认证')}</h3><p>${tr('仅支持 HTTPS。令牌只保存在本机，不会显示在设置页面。')}</p></div></header>
      <label class="image-host-field image-host-wide"><span>${tr('上传地址')}</span><input id="image-host-endpoint" type="url" value="${escapeHTML(state.endpoint)}" placeholder="https://example.com/upload" autocomplete="url"></label>
      <label class="image-host-field"><span>${tr('认证方式')}</span><select id="image-host-auth-mode">${option('none',state.authMode,tr('无认证'))}${option('bearer',state.authMode,'Bearer Token')}${option('header',state.authMode,tr('自定义请求头'))}</select></label>
      <label class="image-host-field" data-image-host-auth="header"><span>${tr('请求头名称')}</span><input id="image-host-token-header" value="${escapeHTML(state.tokenHeader)}" maxlength="64" spellcheck="false"></label>
      <label class="image-host-field"><span>${tr('访问令牌')}</span><input id="image-host-token" type="password" maxlength="512" autocomplete="new-password" placeholder="${state.hasToken?tr('已保存，留空保持不变'):tr('可选')}"></label>
      ${state.hasToken?`<label class="image-host-clear"><input id="image-host-clear-token" type="checkbox"><span>${tr('清除已保存的令牌')}</span></label>`:'<input id="image-host-clear-token" type="checkbox" hidden>'}
    </section>
    <section class="image-host-card">
      <header><div><h3>${tr('上传与返回')}</h3><p>${tr('适配常见的原始图片接口和 multipart/form-data 图床接口。')}</p></div></header>
      <label class="image-host-field"><span>${tr('请求格式')}</span><select id="image-host-body-mode">${option('binary',state.bodyMode,tr('原始 PNG'))}${option('multipart',state.bodyMode,'multipart/form-data')}</select></label>
      <label class="image-host-field" data-image-host-body="multipart"><span>${tr('文件字段名称')}</span><input id="image-host-field-name" value="${escapeHTML(state.fieldName)}" maxlength="64" spellcheck="false"></label>
      <label class="image-host-field"><span>${tr('响应链接路径')}</span><input id="image-host-response-path" value="${escapeHTML(state.responsePath)}" placeholder="data.url" spellcheck="false"><small>${tr('使用点号读取 JSON，例如 data.url')}</small></label>
      <label class="image-host-field"><span>${tr('复制格式')}</span><select id="image-host-link-format">${option('url',state.linkFormat,'URL')}${option('markdown',state.linkFormat,'Markdown')}${option('html',state.linkFormat,'HTML')}</select></label>
      <label class="image-host-field"><span>${tr('超时时间')}</span><span class="image-host-number"><input id="image-host-timeout" type="number" min="5" max="120" value="${state.timeoutSeconds}"><em>${tr('秒')}</em></span></label>
    </section>
    <section class="image-host-test-card"><header><div><h3>${tr('连接测试')}</h3><p>${tr('上传一张测试图片，检查认证、响应解析与图片链接。')}</p></div><button id="image-host-test" type="button">${tr('测试上传')}</button></header><div id="image-host-test-result" role="status"></div></section>
    <footer class="image-host-actions"><div id="image-host-action-status" role="status"></div><button id="image-host-save" type="button" class="primary">${tr('保存设置')}</button></footer>`;
  normalizeSettingItems(root);
}

export async function mountImageHostSettings(root:HTMLElement,api:API,notify:(message:string)=>void){
  let state=await api.imageHostState();
  if(!root.isConnected)return;
  const bind=()=>{
    let tested=state.lastTest,testedSignature=JSON.stringify(draft(root,state)),busy=false;
    const updateTest=(value?:ImageHostResult)=>{
      const status=root.querySelector<HTMLElement>('.image-host-status')!,result=root.querySelector<HTMLElement>('#image-host-test-result')!;
      status.innerHTML=value?`<span class="image-host-result" data-ok="${value.ok}"><i></i>${escapeHTML(value.ok?tr('测试成功'):value.message)}</span><small>${formatDate(value.at,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</small>`:`<span class="image-host-result"><i></i>${tr('尚未测试')}</span>`;
      result.dataset.state=value?(value.ok?'success':'error'):'idle';
      result.innerHTML=value?`<span class="image-host-test-message">${escapeHTML(value.ok?tr('测试成功'):value.message)}</span>${value.link?`<div class="image-host-test-link"><code>${escapeHTML(value.link)}</code><button id="image-host-copy-test" class="quiet" type="button">${tr('复制测试链接')}</button></div>`:''}`:`<p>${tr('测试使用当前填写的配置，无需先保存。任务进度可在任务中心查看。')}</p>`;
      result.querySelector<HTMLButtonElement>('#image-host-copy-test')?.addEventListener('click',()=>void copyTextValue(value!.link!).then(()=>notify(tr('测试链接已复制'))).catch(error=>notify(String(error))));
    };updateTest(tested);
    const reveal=()=>{
      root.querySelectorAll<HTMLElement>('[data-image-host-auth]').forEach(node=>node.hidden=node.dataset.imageHostAuth!==select(root,'image-host-auth-mode').value);
      root.querySelectorAll<HTMLElement>('[data-image-host-body]').forEach(node=>node.hidden=node.dataset.imageHostBody!==select(root,'image-host-body-mode').value);
    };
    select(root,'image-host-auth-mode').addEventListener('change',reveal);
    select(root,'image-host-body-mode').addEventListener('change',reveal);
    reveal();
    const markChanged=()=>{if(tested&&JSON.stringify(draft(root,state))!==testedSignature){root.querySelector<HTMLElement>('.image-host-status')!.innerHTML=`<span class="image-host-result"><i></i>${tr('配置已更改，请重新测试')}</span>`;}else if(tested)updateTest(tested);};
    root.querySelectorAll('input,select').forEach(node=>{node.addEventListener('change',markChanged);node.addEventListener('input',markChanged);});
    const run=async(kind:'test'|'save')=>{
      if(busy)return;busy=true;
      const testButton=root.querySelector<HTMLButtonElement>('#image-host-test')!,saveButton=root.querySelector<HTMLButtonElement>('#image-host-save')!,status=root.querySelector<HTMLElement>('#image-host-action-status')!;
      testButton.disabled=saveButton.disabled=true;status.dataset.state='busy';status.textContent=kind==='test'?tr('正在上传测试图片…'):tr('正在保存…');
      try{
        const value=draft(root,state);
        if(kind==='test'){
          testedSignature=JSON.stringify(value);const link=await api.testImageHost(value);if(!root.isConnected)return;tested={at:Date.now(),ok:true,kind:'test',message:tr('测试成功'),link};updateTest(tested);markChanged();status.textContent='';
        }else{
          await api.configureImageHost(value);state=await api.imageHostState();if(!root.isConnected)return;render(root,state);bind();notify(tr('图床设置已保存'));
        }
      }catch(error){if(root.isConnected){const message=error instanceof Error?error.message:String(error);if(kind==='test'){tested={at:Date.now(),ok:false,kind:'test',message};updateTest(tested);markChanged();status.textContent='';}else{status.dataset.state='error';status.textContent=message;}}}
      finally{busy=false;const nextTest=root.querySelector<HTMLButtonElement>('#image-host-test'),nextSave=root.querySelector<HTMLButtonElement>('#image-host-save');if(nextTest)nextTest.disabled=false;if(nextSave)nextSave.disabled=false;}
    };
    root.querySelector('#image-host-test')?.addEventListener('click',()=>void run('test'));
    root.querySelector('#image-host-save')?.addEventListener('click',()=>void run('save'));
  };
  render(root,state);bind();
}
