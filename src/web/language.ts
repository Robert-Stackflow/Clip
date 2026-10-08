import {setInterfaceLanguage,t as tr} from '../shared/i18n';
import {resolveLanguage,type LanguageChoice} from '../shared/language';
const key='clip.web.language.v1';
export function initializeVisitorLanguage(){
 const selector=document.getElementById('language') as HTMLSelectElement;
 let choice:LanguageChoice='system',changed=()=>{};
 try{const saved=localStorage.getItem(key);if(saved==='en'||saved==='zh-CN'||saved==='system')choice=saved;}catch{}
 // Capture only the original product template, before any shared/user content arrives.
 const texts:{node:Text;source:string}[]=[],attributes:{node:Element;name:string;source:string}[]=[],title=document.title;
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node:Node|null;
 while(node=walker.nextNode()){const text=node as Text;if(/[\u3400-\u9fff]/.test(text.data)&&!text.parentElement?.closest('[data-no-translate]'))texts.push({node:text,source:text.data});}
 for(const element of document.querySelectorAll('[title],[aria-label],[placeholder],[alt]'))for(const name of ['title','aria-label','placeholder','alt']){const source=element.getAttribute(name);if(source&&/[\u3400-\u9fff]/.test(source))attributes.push({node:element,name,source});}
 const apply=()=>{const language=resolveLanguage(choice,navigator.languages?.[0]||navigator.language);setInterfaceLanguage(language);document.documentElement.lang=language;document.title=tr(title);selector.value=choice;for(const item of texts)if(item.node.isConnected)item.node.data=item.source.replace(item.source.trim(),()=>tr(item.source.trim()));for(const item of attributes)item.node.setAttribute(item.name,tr(item.source));};
 selector.addEventListener('change',()=>{const value=selector.value;if(value!=='en'&&value!=='zh-CN'&&value!=='system')return;choice=value;try{localStorage.setItem(key,choice);}catch{}apply();changed();});
 addEventListener('languagechange',()=>{if(choice==='system'){apply();changed();}});apply();return {onChange:(listener:()=>void)=>{changed=listener;}};
}
