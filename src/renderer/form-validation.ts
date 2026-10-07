import {t} from '../shared/i18n';
import './form-validation.css';

let serial=0;
/** Required fields use inline, accessible feedback instead of browser bubbles. */
export function requiredForm(form:HTMLFormElement){
 form.noValidate=true;
 const fields=Array.from(form.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('input[required],textarea[required],select[required]'));
 const headings=new Map<Element,HTMLElement>();
 for(const field of fields){const label=field.closest('.field');if(!label)continue;const heading=document.createElement('span');heading.className='form-field-heading';for(const child of Array.from(label.childNodes))if(child.nodeType===Node.TEXT_NODE)heading.append(child);label.prepend(heading);headings.set(field,heading);}
 const feedback=new Map<Element,{node:HTMLElement;described:string|null}>();
 const clear=(field:typeof fields[number])=>{const entry=feedback.get(field);if(!entry)return;entry.node.remove();field.removeAttribute('aria-invalid');if(entry.described===null)field.removeAttribute('aria-describedby');else field.setAttribute('aria-describedby',entry.described);feedback.delete(field);};
 for(const field of fields)field.addEventListener('input',()=>{if(field.value.trim())clear(field);});
 const validate=()=>{
  let first:typeof fields[number]|undefined;
  for(const field of fields){if(field.disabled||!field.getClientRects().length||field.value.trim()){clear(field);continue;}first??=field;
   if(feedback.has(field))continue;const node=document.createElement('small');node.className='form-field-error';node.id='required-error-'+(++serial);node.setAttribute('role','alert');node.textContent=field.dataset.requiredMessage||t('请填写此字段');
   const described=field.getAttribute('aria-describedby');field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby',[described,node.id].filter(Boolean).join(' '));headings.get(field)?.append(node);feedback.set(field,{node,described});
  }
  first?.focus();return !first;
 };
 form.addEventListener('submit',event=>{if(validate())return;event.preventDefault();event.stopImmediatePropagation();const error=form.querySelector('#modal-error');if(error)error.textContent='';},{capture:true});
 return validate;
}
