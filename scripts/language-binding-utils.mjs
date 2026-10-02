import ts from 'typescript';
export function translationAliases(tree){
 const names=new Set();
 for(const node of tree.statements){
  if(!ts.isImportDeclaration(node)||!ts.isStringLiteral(node.moduleSpecifier)||!node.moduleSpecifier.text.endsWith('/i18n')||node.importClause?.isTypeOnly)continue;
  const bindings=node.importClause?.namedBindings;
  if(bindings&&ts.isNamedImports(bindings))for(const item of bindings.elements)if(!item.isTypeOnly&&(item.propertyName?.text||item.name.text)==='t')names.add(item.name.text);
 }
 return names;
}
export function directTranslationBinding(node,aliases){
 let value=node,parent=node.parent;
 while(parent){
  const transparent=(ts.isParenthesizedExpression(parent)||ts.isAsExpression(parent)||ts.isTypeAssertionExpression(parent)||ts.isNonNullExpression(parent))&&parent.expression===value;
  const selected=ts.isConditionalExpression(parent)&&(parent.whenTrue===value||parent.whenFalse===value);
  if(!transparent&&!selected)break;
  value=parent;parent=parent.parent;
 }
 if(parent&&ts.isCallExpression(parent)&&ts.isIdentifier(parent.expression)&&aliases.has(parent.expression.text)&&parent.arguments[0]===value&&!ts.isTemplateExpression(node))return 'call';
 if(parent&&ts.isTaggedTemplateExpression(parent)&&ts.isIdentifier(parent.tag)&&aliases.has(parent.tag.text)&&parent.template===value)return 'template';
 return undefined;
}
