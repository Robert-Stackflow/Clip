import ts from 'typescript';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {retainedMessages,labelSources} from './language-label-sources.mjs';
import {translationAliases,directTranslationBinding} from './language-binding-utils.mjs';

const coverage=JSON.parse(fs.readFileSync('work/language-coverage.json','utf8'));
const tables=[...labelSources,...['web','sync','attachment'].map(name=>({file:'src/shared/'+name+'-errors.ts',name:name+'Errors'})),{file:'src/main/document-info.ts',name:'documentErrors'}];
const unbound=[],deferredBindings=[],files=[];
const compact=node=>node.getText().replace(/\s+/g,'');
for(const file of coverage.checkedScopes.filter(file=>file.endsWith('.ts'))){
 const source=fs.readFileSync(file,'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true),aliases=translationAliases(tree);
 files.push({file,sha256:crypto.createHash('sha256').update(source).digest('hex')});
 if(file==='src/web/app.ts'){
  // Keep source keys so notices can be translated again on visitor language changes.
  const error=tree.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='VisitorError');
  const constructor=error?.members.find(ts.isConstructorDeclaration);
  assert.equal(compact(constructor),'constructor(readonlysource:string){super(tr(source));}');
  const declarations=tree.statements.filter(ts.isVariableStatement).flatMap(node=>[...node.declarationList.declarations]);
  assert.equal(compact(declarations.find(node=>node.name.getText(tree)==='ownNotice').initializer),'(source:string)=>notice(()=>tr(source))');
  const notice=compact(declarations.find(node=>node.name.getText(tree)==='notice').initializer);
  assert.ok(notice.startsWith('(value:unknown)=>{noticeText=valueinstanceofVisitorError?()=>tr(value.source):'));
  assert.ok(notice.endsWith(';displayNotice();}'));
  assert.equal(compact(declarations.find(node=>node.name.getText(tree)==='displayNotice').initializer),"()=>{$('notice').textContent=noticeText();}");
  assert.ok(source.includes('visitorLanguage.onChange(()=>{render();connection();displayNotice();});'));
 }
 function visit(node){
  let value;
  if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))value=node.text;
  else if(ts.isTemplateExpression(node))value=node.head.text+node.templateSpans.map((span,i)=>'⟦'+i+'⟧'+span.literal.text).join('');
  if(value&&/[\u3400-\u9fff]/.test(value)&&node.parent?.name!==node&&!ts.isLiteralTypeNode(node.parent)&&!retainedMessages.some(item=>item.file===file&&item.value===value)){
   let bound=!!directTranslationBinding(node,aliases);
   for(let parent=node.parent;parent;parent=parent.parent){
    if(ts.isVariableDeclaration(parent)&&tables.some(item=>item.file===file&&item.name===parent.name.getText(tree))){bound=true;break;}
   }
   const parent=node.parent;
   if(!bound&&file==='src/web/app.ts'&&(ts.isCallExpression(parent)&&parent.expression.getText(tree)==='ownNotice'||ts.isNewExpression(parent)&&parent.expression.getText(tree)==='VisitorError')&&parent.arguments?.length===1&&parent.arguments[0]===node){
    bound=true;deferredBindings.push({file,line:tree.getLineAndCharacterOfPosition(node.getStart()).line+1,value,factory:parent.expression.getText(tree)});
   }
   if(!bound)unbound.push({file,line:tree.getLineAndCharacterOfPosition(node.getStart()).line+1,value,context:node.parent.getText(tree).slice(0,180)});
  }
  ts.forEachChild(node,visit);
 }
 visit(tree);
}
fs.mkdirSync('work/language-entry',{recursive:true});
fs.writeFileSync('work/language-entry/bindings-review.json',JSON.stringify({scope:'Static TS literal binding review: imported translation aliases and direct message argument/template only; raw interpolation or nested callback strings are not translated by an ancestor call. Known static tables require separately tested lookup. Visitor deferred factories and redraw inspected explicitly. HTML/runtime/native acceptance remain separate.',files,deferredBindings,unbound},null,2));
console.log(JSON.stringify({files:files.length,deferredBindings:deferredBindings.length,unbound},null,2));
assert.deepEqual(unbound,[],'Unbound application-owned message candidates');
