import {icon} from './ui';
import {t} from '../shared/i18n';
const bound=new WeakSet<HTMLInputElement>();
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** One disk-view filter-field anatomy. Actions are trusted application markup. */
export function searchField(id:string,label:string,placeholder:string,actions=''){
 return `<div class="filter-field" role="search">${icon('search')}<input id="${escape(id)}" type="search" aria-label="${escape(label)}" maxlength="512" placeholder="${escape(placeholder)}" autocomplete="off"><button type="button" class="icon-button quiet search-clear" title="${escape(t('清空'))}" aria-label="${escape(t('清空'))}" hidden>${icon('close')}</button>${actions}</div>`;
}
export function setSearchFieldValue(input:HTMLInputElement,value:string){
 input.value=value;const clear=input.parentElement?.querySelector<HTMLButtonElement>('.search-clear');if(clear)clear.hidden=!value;
}
/** Bind an already-rendered component without moving inputs, focus or live values. */
export function bindSearchFields(root:HTMLElement=document.body){
 for(const input of root.querySelectorAll<HTMLInputElement>('.filter-field>input[type=search]')){
  if(bound.has(input))continue;
  const clear=input.parentElement!.querySelector<HTMLButtonElement>('.search-clear');if(!clear)continue;bound.add(input);
  const sync=()=>{clear.hidden=!input.value;};input.addEventListener('input',sync);clear.onclick=()=>{input.value='';sync();input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();};sync();
 }
}
