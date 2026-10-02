import {EditorState,Text,StateEffect,Compartment} from '@codemirror/state';
import {EditorView,lineNumbers,drawSelection,keymap,highlightSpecialChars,highlightActiveLineGutter} from '@codemirror/view';
import {syntaxHighlighting,HighlightStyle,foldGutter,foldKeymap,LanguageDescription,foldedRanges,foldEffect} from '@codemirror/language';
import {languages} from '@codemirror/language-data';
import {defaultKeymap} from '@codemirror/commands';
import {SearchQuery,setSearchQuery,getSearchQuery,findNext,findPrevious,highlightSelectionMatches,search as searchExtension} from '@codemirror/search';
import {tags} from '@lezer/highlight';
import {createElement,ChevronUp,ChevronDown,X,WrapText} from 'lucide';
import {interfaceLanguage,setInterfaceLanguage,t as tr} from '../shared/i18n';
import './text-preview.css';

// Separate ESM bundle: initialize its catalog without walking or rewriting user text.
setInterfaceLanguage(document.documentElement.lang==='en'?'en':'zh-CN');
const views=new WeakMap<HTMLElement,EditorView>();
export interface TextPreviewSnapshot {anchor:number;head:number;top:number;left:number;wrap:boolean;search:string;searchInput:string;searchOpen:boolean;focus:'reader'|'search'|null;folds:{from:number;to:number}[];scroll:ReturnType<EditorView['scrollSnapshot']>}
export interface TextPreviewOptions {code:boolean;query?:string;wrap:boolean;wrapButton:HTMLButtonElement;changedWrap(value:boolean):void;resume?:TextPreviewSnapshot}
const controls=new WeakMap<HTMLElement,{input:HTMLInputElement;search:HTMLElement;wrap():boolean}>();
export function captureTextPreview(host:HTMLElement):TextPreviewSnapshot|undefined{const view=views.get(host),control=controls.get(host);if(!view||!control)return;const folds:{from:number;to:number}[]=[];foldedRanges(view.state).between(0,view.state.doc.length,(from,to)=>{folds.push({from,to});});return{anchor:view.state.selection.main.anchor,head:view.state.selection.main.head,top:view.scrollDOM.scrollTop,left:view.scrollDOM.scrollLeft,wrap:control.wrap(),search:getSearchQuery(view.state).search,searchInput:control.input.value,searchOpen:!control.search.hidden,focus:document.activeElement===control.input?'search':view.hasFocus?'reader':null,folds,scroll:view.scrollSnapshot()};}
export const previewText=(host:HTMLElement)=>views.get(host)?.state.doc.toString();
export function previewState(host:HTMLElement){const view=views.get(host);return view?{length:view.state.doc.length,lines:view.state.doc.lines,readOnly:view.state.readOnly,selection:{from:view.state.selection.main.from,to:view.state.selection.main.to},viewport:view.viewport}:undefined;}
const highlight=HighlightStyle.define([
 {tag:[tags.keyword,tags.modifier,tags.operatorKeyword],class:'syntax-keyword'},
 {tag:[tags.string,tags.special(tags.string)],class:'syntax-string'},
 {tag:[tags.number,tags.bool,tags.null],class:'syntax-number'},
 {tag:[tags.comment,tags.meta],class:'syntax-comment'},
 {tag:[tags.propertyName,tags.attributeName,tags.labelName],class:'syntax-property'},
 {tag:[tags.typeName,tags.className,tags.tagName],class:'syntax-type'},
 {tag:[tags.function(tags.variableName),tags.definition(tags.variableName)],class:'syntax-function'},
]);
// One code-view.ts theme. Text size and prose font additionally follow Clipper appearance.
const theme=EditorView.theme({
 '&':{height:'100%',backgroundColor:'var(--surface)',color:'var(--fg)',fontSize:'calc(12px * var(--text-scale,1))'},
 '.cm-scroller':{overflow:'auto',fontFamily:'"Cascadia Code",Consolas,"Microsoft YaHei UI",monospace',lineHeight:'1.8'},
 '.cm-content':{padding:'18px 0'},'.cm-line':{padding:'0 22px 0 12px'},
 '.cm-gutters':{backgroundColor:'var(--surface)',color:'var(--muted)',borderRight:'none',padding:'0 5px 0 10px'},
 '.cm-activeLineGutter':{backgroundColor:'var(--soft)'},'.cm-selectionBackground':{backgroundColor:'var(--selected) !important'},
 '&.cm-focused':{outline:'none'},'.cm-foldPlaceholder':{border:'none',backgroundColor:'var(--soft)',color:'var(--muted)',padding:'0 5px'},
 '.cm-searchMatch':{backgroundColor:'#e9bd4f40',outline:'none'},'.cm-searchMatch-selected':{backgroundColor:'#e9bd4f80'},
});
export function languageFor(name:string){
 const lower=name.toLowerCase();let result=LanguageDescription.matchFilename(languages,name)||LanguageDescription.matchFilename(languages,lower);
 if(!result){const type=/^(\.env(?:\..*)?|\.npmrc|\.yarnrc|.*\.(conf|cfg|properties))$/.test(lower)?'properties':/\.(ini|reg)$/.test(lower)?'ini':/\.(poytoml|lock)$/.test(lower)?'toml':/\.(jsonl|ndjson|ipynb)$/.test(lower)?'json':/\.(ps1|psm1|psd1)$/.test(lower)?'powershell':/\.(bat|cmd)$/.test(lower)?'powershell':undefined;if(type)result=LanguageDescription.matchLanguageName(languages,type,true);}
 return result;
}
function clipboardLanguage(text:string){const prefix=text.slice(0,8192);return languageFor(/^\s*\{\s*"/.test(prefix)?'clipboard.json':/^\s*(?:def |class .+:)/m.test(prefix)?'clipboard.py':/^\s*SELECT .+ FROM /im.test(prefix)?'clipboard.sql':'clipboard.js');}
const iconButton=(label:string,glyph:typeof X)=>{const button=document.createElement('button');button.type='button';button.className='icon-button quiet';button.title=button.ariaLabel=label;button.append(createElement(glyph,{class:'icon','aria-hidden':'true','stroke-width':1.75}));return button;};
export function renderText(host:HTMLElement,text:string,options:TextPreviewOptions){
 const root=document.createElement('div');root.className='code-reader text-reader';root.setAttribute('aria-busy','true');
 const search=document.createElement('div');search.className='code-search';search.hidden=true;
 const input=document.createElement('input');input.type='search';input.placeholder=input.ariaLabel=tr('查找文本');
 const state=document.createElement('span');state.className='preview-search-state';state.setAttribute('role','status');
 const previous=iconButton(tr('上一个匹配'),ChevronUp),next=iconButton(tr('下一个匹配'),ChevronDown),close=iconButton(tr('关闭查找'),X);search.append(input,state,previous,next,close);
 const mount=document.createElement('div');mount.className='code-mount';const loading=document.createElement('div');loading.className='code-loading';loading.textContent=tr('正在读取预览…');mount.append(loading);root.append(search,mount);host.append(root);
 let disposed=false,view:EditorView|undefined,wrap=options.resume?.wrap??options.wrap;const wrapConfig=new Compartment();
 const worker=new Worker(new URL('../text-preview-worker.js',import.meta.url));
 const load=new Promise<string[]>((resolve,reject)=>{worker.onmessage=e=>{worker.terminate();e.data.error?reject(new Error(e.data.error)):resolve(e.data.lines);};worker.onerror=e=>{worker.terminate();reject(new Error(e.message));};});
 worker.postMessage({text,language:interfaceLanguage()});
 const language=options.code?clipboardLanguage(text):undefined;
 const showSearch=()=>{search.hidden=false;input.focus();input.select();state.textContent='';view?.requestMeasure();return true;};
 const hideSearch=()=>{search.hidden=true;view?.focus();view?.requestMeasure();};
 const searchNext=(back=false)=>{if(!view)return;state.textContent='';view.dispatch({effects:setSearchQuery.of(new SearchQuery({search:input.value,literal:true}))});if(input.value&&!(back?findPrevious:findNext)(view))state.textContent=tr('没有匹配文本');};
 next.onclick=()=>searchNext();previous.onclick=()=>searchNext(true);close.onclick=hideSearch;
 input.onkeydown=e=>{if(e.isComposing)return;if(e.key==='Enter'){e.preventDefault();e.stopPropagation();searchNext(e.shiftKey);}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();hideSearch();}};
 root.addEventListener('keydown',e=>{if(e.isComposing)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();e.stopPropagation();showSearch();}});
 const wrapButton=options.wrapButton;wrapButton.replaceChildren(createElement(WrapText,{class:'icon','aria-hidden':'true','stroke-width':1.75}));wrapButton.setAttribute('aria-pressed',String(wrap));wrapButton.disabled=true;
 wrapButton.onclick=()=>{if(!view)return;wrap=!wrap;wrapButton.setAttribute('aria-pressed',String(wrap));view.dispatch({effects:wrapConfig.reconfigure(wrap?[EditorView.lineWrapping]:[])});options.changedWrap(wrap);};
 const appearance=new MutationObserver(()=>view?.requestMeasure());appearance.observe(document.documentElement,{attributes:true,attributeFilter:['style','data-theme','data-density']});
 void load.then(async lines=>{
  if(disposed||!host.isConnected)return;mount.replaceChildren();
  view=new EditorView({parent:mount,state:EditorState.create({doc:Text.of(lines),extensions:[EditorState.readOnly.of(true),EditorView.editable.of(false),EditorView.contentAttributes.of({tabindex:'0','aria-label':tr('文本预览')}),...(options.code?[lineNumbers(),foldGutter(),highlightActiveLineGutter()]:[EditorView.theme({'.cm-scroller':{fontFamily:'var(--ui-font-family,"Segoe UI",sans-serif)'}})]),highlightSpecialChars(),drawSelection(),highlightSelectionMatches(),searchExtension(),theme,syntaxHighlighting(highlight),keymap.of([{key:'Mod-f',run:showSearch},...defaultKeymap,...foldKeymap]),wrapConfig.of(wrap?[EditorView.lineWrapping]:[])]})});
  views.set(host,view);controls.set(host,{input,search,wrap:()=>wrap});wrapButton.disabled=false;root.dataset.ready='true';root.setAttribute('aria-busy','false');
  const resume=options.resume;if(resume){const length=view.state.doc.length;input.value=resume.searchInput;search.hidden=!resume.searchOpen;view.dispatch({selection:{anchor:Math.min(resume.anchor,length),head:Math.min(resume.head,length)},effects:[resume.scroll,setSearchQuery.of(new SearchQuery({search:resume.search,literal:true})),...resume.folds.filter(r=>r.from>=0&&r.to<=length&&r.from<r.to).map(r=>foldEffect.of(r))]});view.requestMeasure({read:()=>undefined,write:()=>{if(disposed||!view)return;if(resume.focus&&(document.activeElement===document.body||host.contains(document.activeElement))){if(resume.focus==='search')input.focus({preventScroll:true});else view.focus();}}});}
  else if(options.query){view.dispatch({effects:setSearchQuery.of(new SearchQuery({search:options.query,literal:true}))});findNext(view);}
  if(language){const support=await language.load();if(!disposed&&view)view.dispatch({effects:StateEffect.appendConfig.of(support)});}
 }).catch(error=>{if(!disposed&&host.isConnected){loading.textContent=String(error.message);mount.replaceChildren(loading);root.setAttribute('aria-busy','false');document.dispatchEvent(new CustomEvent('clipper:feedback',{detail:error.message}));}});
 return()=>{disposed=true;worker.terminate();appearance.disconnect();view?.destroy();view=undefined;views.delete(host);controls.delete(host);wrapButton.onclick=null;root.remove();};
}
