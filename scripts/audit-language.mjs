import ts from 'typescript';
import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,relative} from 'node:path';
const han=/[\u3400-\u9fff]/,entries=[],other=[];
async function walk(folder){for(const item of await readdir(folder,{withFileTypes:true})){const file=join(folder,item.name);if(item.isDirectory()){if(item.name!=='locales')await walk(file);continue;}const source=await readFile(file,'utf8'),name=relative('.',file).replaceAll('\\','/');
 if(file.endsWith('.ts')){const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);function visit(node){let value,kind;if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)){value=node.text;kind='literal';}else if(ts.isTemplateExpression(node)){value=node.head.text;node.templateSpans.forEach((span,i)=>value+='⟦'+i+'⟧'+span.literal.text);kind='template';}
  if(value&&han.test(value)){const location=tree.getLineAndCharacterOfPosition(node.getStart(tree));entries.push({file:name,line:location.line+1,kind,value,property:node.parent?.name===node,context:ts.SyntaxKind[node.parent?.kind],sample:node.parent?.getText(tree).slice(0,180)});}ts.forEachChild(node,visit);}visit(tree);
 }else if(file.endsWith('.html')){for(const match of source.matchAll(/>\s*([^<>]*[\u3400-\u9fff][^<>]*)\s*</g))entries.push({file:name,kind:'html-text',value:match[1].trim()});for(const match of source.matchAll(/\b(?:title|placeholder|aria-label|alt)="([^"]*[\u3400-\u9fff][^"]*)"/g))entries.push({file:name,kind:'html-attribute',value:match[1]});}
 else if(/\.(?:cs|ps1)$/.test(file)&&han.test(source)){other.push({file:name,lines:source.split(/\r?\n/).flatMap((line,i)=>han.test(line)?[{line:i+1,text:line.slice(0,240)}]:[])});}
}}
await walk('src');await mkdir('work',{recursive:true});const files={};for(const entry of entries){files[entry.file]??={entries:0,characters:0};files[entry.file].entries++;files[entry.file].characters+=entry.value.length;}
await writeFile('work/language-inventory.json',JSON.stringify({entries,other,files},null,2));console.log(JSON.stringify({entries:entries.length,unique:new Set(entries.map(e=>e.value)).size,files,otherFiles:other.map(f=>({file:f.file,lines:f.lines.length}))},null,2));
