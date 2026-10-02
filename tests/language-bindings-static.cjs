const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript');
async function bindings(source){
 const {translationAliases,directTranslationBinding}=await import('../scripts/language-binding-utils.mjs');
 const tree=ts.createSourceFile('fixture.ts',source,ts.ScriptTarget.Latest,true),aliases=translationAliases(tree),results=[];
 function visit(node){let text;if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))text=node.text;else if(ts.isTemplateExpression(node))text=node.head.text+node.templateSpans.map((span,i)=>'⟦'+i+'⟧'+span.literal.text).join('');if(text&&/[\u3400-\u9fff]/.test(text))results.push({text,bound:!!directTranslationBinding(node,aliases)});ts.forEachChild(node,visit);}
 visit(tree);return results;
}
test('Binding audit accepts complete selected message keys and direct translated templates',async()=>{
 const result=await bindings("import {t as tr} from '../shared/i18n';tr(flag?'保存':'取消');tr(('确定' as const));tr`提示${tr('已保存')}`;");
 assert.deepEqual(result,[{text:'保存',bound:true},{text:'取消',bound:true},{text:'确定',bound:true},{text:'提示⟦0⟧',bound:true},{text:'已保存',bound:true}]);
});
test('Binding audit rejects raw template parameters, callback text and dynamic string keys',async()=>{
 const result=await bindings("import {t as tr} from '../shared/i18n';tr`${flag?'保存':'取消'}`;tr(build('确定'));tr(()=> '失败');tr(name==='中文'? '选择':'完成');tr(`提示${'原文'}`);");
 assert.deepEqual(result,[{text:'保存',bound:false},{text:'取消',bound:false},{text:'确定',bound:false},{text:'失败',bound:false},{text:'中文',bound:false},{text:'选择',bound:true},{text:'完成',bound:true},{text:'提示⟦0⟧',bound:false},{text:'原文',bound:false}]);
});
test('Binding audit only trusts real value imports from the i18n module',async()=>{
 assert.deepEqual(await bindings("import {t as translate} from '../shared/i18n';translate('保存');"),[{text:'保存',bound:true}]);
 for(const source of ["import {t as tr} from './other';tr('保存');","import type {t as tr} from '../shared/i18n';tr('保存');","const tr=(value)=>value;tr('保存');","import * as i18n from '../shared/i18n';i18n.t('保存');"]){assert.deepEqual(await bindings(source),[{text:'保存',bound:false}]);}
});
