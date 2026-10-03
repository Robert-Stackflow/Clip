import {StreamLanguage, type StreamParser} from '@codemirror/language';
import {highlightTree, tagHighlighter, tags} from '@lezer/highlight';
import {shell} from '@codemirror/legacy-modes/mode/shell';
import {stex} from '@codemirror/legacy-modes/mode/stex';
import {javascript} from '@codemirror/legacy-modes/mode/javascript';
import {python} from '@codemirror/legacy-modes/mode/python';
import {java} from '@codemirror/legacy-modes/mode/clike';
import {phpLanguage} from '@codemirror/lang-php';
import {standardSQL} from '@codemirror/legacy-modes/mode/sql';
import {properties} from '@codemirror/legacy-modes/mode/properties';

const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const style=tagHighlighter([
 {tag:[tags.keyword,tags.modifier],class:'reference-syntax-keyword'},
 {tag:[tags.string,tags.special(tags.string)],class:'reference-syntax-string'},
 {tag:[tags.number,tags.bool,tags.null],class:'reference-syntax-number'},
 {tag:[tags.comment,tags.meta],class:'reference-syntax-comment'},
 {tag:[tags.variableName,tags.attributeName,tags.propertyName],class:'reference-syntax-variable'},
 {tag:[tags.tagName,tags.typeName,tags.standard(tags.variableName)],class:'reference-syntax-command'},
 {tag:[tags.operator,tags.punctuation],class:'reference-syntax-operator'},
]);
// Patterns in the Regex tables are fragments, not JavaScript source files.
const regex:StreamParser<null>={
 startState:()=>null,
 token(stream){
  if(stream.eatSpace())return null;
  if(stream.match(/^\\(?:[pP]\{[^}]*\}|[xu][\da-fA-F]+|.)/))return 'string.special';
  if(stream.match(/^\(\?#[^)]*\)/))return 'comment';
  if(stream.match(/^\{\d+(?:,\d*)?\}/))return 'number';
  if(stream.match(/^[\^$.*+?|()[\]{}-]/))return 'operator';
  stream.next();return null;
 }
};
const modes:Record<string,StreamParser<unknown>>={shell,bash:shell,sh:shell,git:shell,linux:shell,latex:stex,tex:stex,katex:stex,regex,regexp:regex,javascript,js:javascript,python,py:python,java,sql:standardSQL,ini:properties};
const languages=new Map<string,StreamLanguage<unknown>>();
const phpPlain=phpLanguage.parser.configure({top:'Program'});
export function highlightCheatCode(text:string,language:string):string{
 const name=language.trim().split(/\s+/)[0].toLowerCase(),mode=modes[name];
 // Bound parsing work; unsupported examples still display and copy verbatim.
 if((!mode&&name!=='php')||text.length>65536)return escape(text);
 let parser=languages.get(name);if(!parser&&mode){parser=StreamLanguage.define(mode);languages.set(name,parser);}
 let result='',end=0;
 highlightTree((parser?.parser??(text.includes('<?')?phpLanguage.parser:phpPlain)).parse(text),style,(from,to,classes)=>{
  result+=escape(text.slice(end,from))+`<span class="${classes}">${escape(text.slice(from,to))}</span>`;end=to;
 });
 return result+escape(text.slice(end));
}
