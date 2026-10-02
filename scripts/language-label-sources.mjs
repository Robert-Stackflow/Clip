import ts from 'typescript';
import {readFile} from 'node:fs/promises';
// Display labels selected from owned static tables, never from runtime field values.
export const labelSources=[{file:'src/shared/metadata.ts',name:'metadataLabels'},{file:'src/shared/formats.ts',name:'formatDefinitions',property:'label'}];
export async function readLabelSources(){const result=[];for(const spec of labelSources){const source=await readFile(spec.file,'utf8'),tree=ts.createSourceFile(spec.file,source,ts.ScriptTarget.Latest,true),values=[];let found=false;
 function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(tree)===spec.name&&node.initializer){found=true;function collect(value){if(ts.isPropertyAssignment(value)&&(!spec.property||value.name.getText(tree)===spec.property)&&ts.isStringLiteral(value.initializer)&&/[\u3400-\u9fff]/.test(value.initializer.text))values.push(value.initializer.text);ts.forEachChild(value,collect);}collect(node.initializer);}ts.forEachChild(node,visit);}visit(tree);if(!found||!values.length)throw new Error('Missing display label table: '+spec.name);result.push({...spec,values:[...new Set(values)]});}return result;}
export const retainedMessages=[{file:'src/main/content-info.ts',value:'Unicode 文本',reason:'Existing non-exportable format identifier. Only its separate display label is translated.'},
 ...['AI 处理','脚本处理','URL 导入','拖入文字','拖入文件','OCR 识别','窗口截图','屏幕截图','未知应用','划词 · ','图片编辑','录屏与录音','长截图'].map(value=>({file:'src/main/index.ts',value,reason:'Existing stored source identifier or prefix used by user search/category rules; changing UI language does not rename it.'})),
 {file:'src/main/sync-ledger.ts',value:'局域网同步',reason:'Existing stored source identifier used by search/category rules; does not depend on either device language.'},
 {file:'src/main/stack.ts',value:'堆栈按行拆分',reason:'Existing stored history source used by search and category rules; interface language does not rename it.'},
 ...['日期','时间'].map(value=>({file:'src/shared/advanced.ts',value,reason:'Existing template variable key, used literally in saved user templates regardless of interface language.'})),
 {file:'src/renderer/language-ui.ts',value:'简体中文',reason:'Language endonym deliberately remains readable while choosing another interface language.'},
 {file:'src/main/web-share.ts',value:'网页 · ',reason:'Existing persisted clipboard source prefix; visitor language does not rename stored records.'},
 ...['AI 处理','脚本处理'].map(value=>({file:'src/renderer/text-tools-ui.ts',value,reason:'Stable TextApply source identifier stored in history and validated by IPC; not a display label.'})),
 ...['AI 处理','脚本处理'].map(value=>({file:'src/shared/text-tools.ts',value,reason:'TextApply source union defines existing stored identifiers, independent of interface language.'})),
 {file:'src/renderer/text-tools-ui.ts',value:'简体中文',reason:'Existing default target language sent to the model, independent of interface language; editable by the user.'},
 ...['clipper-win://search?q=关键词','clipper-win://add?text=待保存文字','clipper-win://copy?text=待复制文字'].map(value=>({file:'src/renderer/text-tools-ui.ts',value,reason:'Literal URL example including sample user data; protocol and sample values stay unchanged.'}))
];
