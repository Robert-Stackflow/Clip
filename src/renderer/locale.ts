import {setInterfaceLanguage,interfaceLanguage,t} from '../shared/i18n';
import type {LanguageAPI} from '../shared/language';
declare global{interface Window{clipperLanguage?:LanguageAPI}}
setInterfaceLanguage(window.clipperLanguage?.current||'zh-CN');
document.documentElement.lang=interfaceLanguage();
// Only the initial product HTML exists at this point. Never observe or rewrite later user content.
const walker=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_TEXT),nodes:Text[]=[];
while(walker.nextNode()){const node=walker.currentNode as Text;if(!node.parentElement?.closest('script,style'))nodes.push(node);}
for(const node of nodes){const value=node.data,trimmed=value.trim();if(trimmed)node.data=value.replace(trimmed,()=>t(trimmed));}
for(const element of document.querySelectorAll('[title],[placeholder],[aria-label],[alt]'))for(const attribute of ['title','placeholder','aria-label','alt']){const value=element.getAttribute(attribute);if(value)element.setAttribute(attribute,t(value));}
