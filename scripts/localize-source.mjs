// Run only on files whose product literals and persisted identifiers have been reviewed.
import ts from 'typescript';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
const han=/[\u3400-\u9fff]/,messages=new Set();
const files=process.argv.slice(2);if(!files.length)throw new Error('Explicit reviewed source files required');
for(const input of files){const file=resolve(input),name=relative(resolve('src'),file).replaceAll('\\','/');if(isAbsolute(name)||name.startsWith('..')||!name.endsWith('.ts'))throw new Error('Source path outside src');const source=await readFile(file,'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true),edits=[];let changed=false;
 function visit(node){const existingCall=node.parent&&ts.isCallExpression(node.parent)&&['t','tr'].includes(node.parent.expression.getText(tree)),existingTag=node.parent&&ts.isTaggedTemplateExpression(node.parent)&&['t','tr'].includes(node.parent.tag.getText(tree));
  if(ts.isTemplateExpression(node)&&han.test(node.head.text+node.templateSpans.map(s=>s.literal.text).join(''))){const key=node.head.text+node.templateSpans.map((s,i)=>'⟦'+i+'⟧'+s.literal.text).join('');messages.add(key);if(!existingTag){edits.push([node.getStart(tree),'tr']);changed=true;}}
  else if((ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))&&han.test(node.text)&&node.parent?.name!==node&&!ts.isLiteralTypeNode(node.parent)){messages.add(node.text);if(!existingCall&&!existingTag){edits.push([node.getStart(tree),'tr('],[node.end,')']);changed=true;}}
  ts.forEachChild(node,visit);
 }visit(tree);if(changed){let next=source;for(const [position,text] of edits.sort((a,b)=>b[0]-a[0]))next=next.slice(0,position)+text+next.slice(position);if(!/import\s*\{[^}]*\bt\s+as\s+tr\b/.test(next))next="import {t as tr} from '../shared/i18n';\n"+next;await writeFile(file,next);}
}
await mkdir('work',{recursive:true});await writeFile('work/language-selected-messages.json',JSON.stringify([...messages],null,2));console.log('Reviewed files processed: '+files.length+'; messages: '+messages.size);
