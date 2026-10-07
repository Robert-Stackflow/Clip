import {t} from '../shared/i18n';

const controlSelector='input,select,textarea,button,output,.switch,.theme-modes,.inline-fields,.swatch-list,.color-field,.shortcut-field,.custom-select-wrap,.number-control,.data-path-row,.data-controls,.image-host-number';

/** Move live controls rather than rebuilding them: values, listeners and picker state stay intact. */
export function normalizeSettingItems(root:HTMLElement,settingsSection=false){
 if(!settingsSection&&!root.closest('.settings-page'))return;
 for(const row of root.querySelectorAll<HTMLElement>('.setting-row,.appearance-row,label.field,.inline-check-row,.desktop-check,.efficiency-toggle,.image-host-field,.tool-check,.image-host-clear')){
  if(row.classList.contains('settings-item')||row.closest('.settings-actions'))continue;
  if(!Array.from(row.children).some(node=>node.matches(controlSelector)))continue;
  const copy=document.createElement('span'),title=document.createElement('span'),controls=document.createElement('span');
  copy.className='settings-item-copy';title.className='settings-item-title';controls.className='settings-item-control';
  const checkbox=row.matches('.tool-check,.image-host-clear,.desktop-check,.efficiency-toggle')?row.querySelector<HTMLInputElement>('input[type=checkbox]'):null;
  if(checkbox){const toggle=document.createElement('span');toggle.className='switch';checkbox.setAttribute('role','switch');toggle.append(checkbox,document.createElement('span'));controls.append(toggle);}
  for(const node of Array.from(row.childNodes)){
   if(node instanceof HTMLElement&&node.matches('p,small,.field-help')){node.classList.add('settings-item-desc');copy.append(node);}
   else if(node instanceof HTMLElement&&node.matches(controlSelector))controls.append(node);
   else if(node instanceof HTMLElement&&node.matches('div')&&!node.querySelector('input,select,textarea,button')){
    for(const child of Array.from(node.childNodes)){
     if(child instanceof HTMLElement&&child.matches('p,small')){child.classList.add('settings-item-desc');copy.append(child);}else title.append(child);
    }
   }else title.append(node);
  }
  if(!controls.childNodes.length)continue;
  copy.prepend(title);row.classList.add('settings-item');row.replaceChildren(copy,controls);
  // Keep accessible field names independent of helper text or selected option text.
  title.id='setting-title-'+crypto.randomUUID();
  const description=copy.querySelector<HTMLElement>('.settings-item-desc');if(description&&!description.id)description.id='setting-desc-'+crypto.randomUUID();
  for(const field of controls.querySelectorAll<HTMLElement>('input,textarea,select,[role=combobox]')){
   if(!field.hasAttribute('aria-label')&&!field.hasAttribute('aria-labelledby'))field.setAttribute('aria-labelledby',title.id);
   if(description&&!field.hasAttribute('aria-describedby'))field.setAttribute('aria-describedby',description.id);
  }
 }
 normalizeSettingsCards(root);
}

export function settingsCard(title:string,nodes:HTMLElement[],description=''){
 const card=document.createElement('section'),heading=document.createElement('header'),name=document.createElement('h3');
 card.className='settings-card';heading.className='settings-card-heading';name.textContent=title;heading.append(name);
 if(description){const help=document.createElement('p');help.textContent=description;heading.append(help);}
 card.append(heading,...nodes);return card;
}

function normalizeSettingsCards(root:HTMLElement){
 const selector='.settings-card,.image-host-card,.image-host-test-card,.image-host-overview,.vault-card';
 for(const card of [...(root.matches(selector)?[root]:[]),...root.querySelectorAll<HTMLElement>(selector)]){
  card.classList.add('settings-card');
  const title=card.querySelector<HTMLElement>(':scope > h3');
  if(title){const header=document.createElement('header');header.className='settings-card-heading';title.before(header);header.append(title);const next=header.nextElementSibling;if(next?.matches('p.field-help'))header.append(next);}
  const header=card.querySelector<HTMLElement>(':scope > header');if(header)header.classList.add('settings-card-heading');
 }
}

/** Group each settings section by purpose, retaining the existing save boundaries. */
export function organizeSettingsPanel(panel:HTMLElement){
 const field=(id:string)=>panel.querySelector<HTMLElement>('#'+id);
 const row=(id:string)=>field(id)?.closest<HTMLElement>('.setting-row,label.field,.tool-check')!;
 if(field('shortcut')){
  const windows=['shortcut','quick-panel-shortcut','replies-shortcut','ai-chat-shortcut','desktop-shortcut'].map(row).filter(Boolean);
  const content=['nextShortcut','intercept-win-v'].map(row).filter(Boolean);
  const heading=panel.firstElementChild!;heading.after(settingsCard(t('打开窗口'),windows),settingsCard(t('内容操作'),content));
 }
 const meter=field('storage-meter');if(meter){
  const card=meter.closest<HTMLElement>('.settings-card')!,heading=document.createElement('h3');heading.textContent=t('资料存储');card.prepend(heading);
  const clear=row('clear-history');(field('history-vault')||card).after(settingsCard(t('数据清理'),[clear]));
  const migrate=field('migrate-storage'),location=panel.querySelector<HTMLElement>('.storage-location');
  if(migrate&&location){const copy=document.createElement('div');copy.append(...Array.from(location.childNodes));location.replaceChildren(copy,migrate);location.classList.add('storage-directory-row');}
 }
 if(field('backup-enabled')){
  const heading=panel.firstElementChild!,enabled=row('backup-enabled'),interval=row('backup-interval').parentElement!,encrypted=row('backup-encrypted'),passwords=field('backup-password-fields')!,help=passwords.nextElementSibling as HTMLElement;
  // Coverage belongs to the card introduction; password guidance belongs to encryption.
  help.textContent=t('请保存备份密码，忘记后无法恢复。更换密码只影响新备份；关闭加密会清除已保存的密码。');
  const plan=settingsCard(t('备份计划'),[enabled,row('backup-directory'),interval]);
  for(const node of Array.from(enabled.childNodes))if(node.nodeType===Node.TEXT_NODE&&node.textContent?.trim())node.textContent=t('启用自动备份');
  const security=settingsCard(t('备份内容与安全'),[encrypted,passwords,help],t('备份包含历史、快捷回复、分类和脚本，不包含 API 密钥、本机设置或源文件。'));
  heading.after(plan,security);const actions=field('save-backup-settings')!.parentElement!;actions.classList.add('settings-actions');security.append(actions);
  const status=field('backup-status')!,statusCard=settingsCard(t('备份状态'),[]);status.before(statusCard);statusCard.append(status);
 }
 if(field('backup-entries')){
  const heading=panel.firstElementChild!,list=field('backup-entries')!,card=settingsCard(t('备份文件'),[list]);
  const actions=field('protected-export')!.parentElement!;actions.classList.add('settings-card-actions');card.querySelector('header')!.append(actions);heading.after(card);
 }
 const checkpoints=panel.querySelector<HTMLElement>('.checkpoint-workbench');if(checkpoints){
  const card=settingsCard(t('数据恢复点'),[]),create=field('checkpoint-create');if(create)card.querySelector('header')!.append(create);checkpoints.before(card);card.append(checkpoints);
 }
 normalizeSettingItems(panel,true);
}
