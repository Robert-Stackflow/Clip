const generated=require('./generated-fixtures.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const a=require('../work/test-exports.cjs'),raw='保存 设置 <img> ⟦0⟧',source='保存.exe',png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH3sAAAAASUVORK5CYII=';
const base=generated.directory;
async function folder(){await fs.mkdir(base,{recursive:true});return generated.mkdtemp(path.join(base,'language-history-'));}
async function cleanup(root){const target=await fs.realpath(root),allowed=await fs.realpath(base);assert.equal(path.dirname(target).toLowerCase(),allowed.toLowerCase());assert.match(path.basename(target),/^language-history-/);await fs.rm(target,{recursive:true,force:true});}
async function both(fn){try{for(const language of ['zh-CN','en']){a.setInterfaceLanguage(language);await fn(language,(zh,en)=>language==='en'?en:zh);}}finally{a.setInterfaceLanguage('zh-CN');}}
const messages=[];

test('new history labels follow UI language while clipboard text, filenames, bytes and sources stay literal',()=>both(async(language,label)=>{
 const s=new a.Store(':memory:');try{
  const image=s.add({png},source),rich=s.add({html:'<b>'+raw+'</b>'},source),file=s.add({files:['D:\\保存 设置\\原始文件.txt']},source),attachment=s.add({attachments:[{name:'保存 设置.txt',data:Buffer.from(raw).toString('base64')}]},source),directory=s.add({attachments:[{name:'保存目录',data:'',directory:true}]},source),text=s.add({text:raw},source);
  assert.equal(image.title,label('剪贴板图片','Clipboard image'));assert.equal(rich.title,label('富文本内容','Rich text content'));assert.equal(file.title,label('1 个文件 · 原始文件.txt','Files (1) · 原始文件.txt'));assert.equal(attachment.title,label('1 个附件 · 保存 设置.txt','Attachments (1) · 保存 设置.txt'));assert.equal(directory.title,label('1 项文件与文件夹 · 保存目录','Items (1) · 保存目录'));assert.equal(text.title,raw);
  assert.equal(image.payload.png,png);assert.equal(rich.payload.html,'<b>'+raw+'</b>');assert.equal(Buffer.from(attachment.payload.attachments[0].data,'base64').toString(),raw);for(const item of s.all())assert.equal(item.source,source);
  messages.push({language,titles:s.all().map(i=>({kind:i.kind,title:i.title,preview:i.preview,source:i.source}))});
 }finally{s.close();}
}));

test('restart, duplicate capture, undo and cross-language backup restore preserve saved labels and original data',async()=>{
 const root=await folder(),file=path.join(root,'保存.sqlite');let s,restored,legacy;
 try{a.setInterfaceLanguage('zh-CN');s=new a.Store(file);const image=s.add({png},source),rich=s.add({html:'<b>'+raw+'</b>'},source),backup=s.backup();s.close();a.setInterfaceLanguage('en');s=new a.Store(file);
  for(const original of [image,rich]){assert.deepEqual(s.get(original.id),JSON.parse(JSON.stringify(original)));assert.equal(s.add(original.payload,source).title,original.title);s.delete(original.id);s.undo();const undone=s.all().find(i=>i.hash===original.hash);assert.equal(undone.title,original.title);assert.equal(undone.preview,original.preview);assert.deepEqual(undone.payload,original.payload);}
  restored=new a.Store(':memory:');assert.equal(restored.import(backup),2);for(const original of [image,rich]){const actual=restored.all().find(i=>i.hash===original.hash);assert.equal(actual.title,original.title);assert.equal(actual.preview,original.preview);assert.equal(actual.source,source);assert.deepEqual(actual.payload,original.payload);}
  legacy=new a.Store(':memory:');const old=structuredClone(backup);for(const item of old.clips){delete item.title;delete item.preview;}legacy.import(old);assert.equal(legacy.all().find(i=>i.kind==='image').title,'Clipboard image');
  const malformed=new a.Store(':memory:');try{const altered=structuredClone(backup);altered.clips[0].title={unexpected:raw};altered.clips[0].preview=raw.repeat(100);altered.clips[1].title='x'.repeat(33001);malformed.import(altered);for(const item of malformed.all()){assert.equal(typeof item.title,'string');assert.ok(item.title.length<100);assert.ok(item.preview.length<=240);}}finally{malformed.close();}
  a.setInterfaceLanguage('zh-CN');const backAgain=new a.Store(':memory:');try{backAgain.import(legacy.backup());assert.equal(backAgain.all().find(i=>i.kind==='image').title,'Clipboard image');}finally{backAgain.close();}
 }finally{s?.close();restored?.close();legacy?.close();a.setInterfaceLanguage('zh-CN');await cleanup(root);}
});

test('template builtins and user variables are stable across languages; errors localize only the owned prefix',()=>both(async(_language,label)=>{
 const payload={text:'{{日期}} {{时间}} {{保存 ⟦0⟧}}',html:'<b>unchanged source</b>'},now=new Date(2026,9,1,9,5);assert.deepEqual(a.builtins,['日期','时间']);assert.deepEqual(a.fillTemplate(payload,{'保存 ⟦0⟧':raw},now),{text:'2026-10-01 09:05 '+raw});assert.equal(payload.html,'<b>unchanged source</b>');assert.throws(()=>a.fillTemplate(payload,{},now),{message:label('请填写模板变量：保存 ⟦0⟧','Fill in the template variable: 保存 ⟦0⟧')});assert.throws(()=>a.fillTemplate({text:'{{name}}'},{other:'x'}),{message:label('包含未知模板变量','Unknown template variables were provided')});
 const s=new a.Store(':memory:');try{s.saveCategory({name:raw,color:a.categoryColors[0],kind:'text',contains:'保存',source,tag:''});assert.equal(s.categories[0].name,raw);s.saveSnippet({title:raw,payload});assert.equal(s.snippets()[0].title,raw);assert.deepEqual(s.snippets()[0].payload,payload);}finally{s.close();}
}));

test('history mutation errors do not change transaction, duplicate or external-error behavior',()=>both(async(_language,label)=>{
 const s=new a.Store(':memory:');try{const x=s.add({text:raw},source),y=s.add({text:'另一段'},source),before=s.backup();assert.throws(()=>s.edit(y.id,raw,[]),{message:label('已有相同内容的记录','A record with the same content already exists')});assert.deepEqual(s.get(y.id).payload,{text:'另一段'});assert.throws(()=>s.get('missing'),{message:label('记录已不存在','This record no longer exists')});assert.throws(()=>s.batch([],'delete'),{message:label('一次选择 1–500 条记录','Select 1–500 records at a time')});const external=new Error(raw);s.onChange=()=>{throw external;};assert.throws(()=>s.batch([x.id],'delete'),e=>e===external);assert.equal(s.all().length,before.clips.length);assert.deepEqual(s.get(x.id).payload,{text:raw});s.onChange=undefined;}finally{s.close();}
}));

test('localized hotkey conflicts still roll back provisional reservations and preserve the old callback',()=>both(async(_language,label)=>{
 const registered=new Map(),events=[],registry=new a.HotkeyRegistry({register:(key,fn)=>{fn();if(key.endsWith('+X'))return false;registered.set(key,fn);return true;},unregister:key=>registered.delete(key)});
 try{registry.replace([['Control+Alt+A',()=>events.push('old')]]);assert.throws(()=>registry.replace([['Control+Alt+B',()=>events.push('new')],['Control+Alt+X',()=>{}]]),{message:label('快捷键 Ctrl+Alt+X 已被占用，请更换','Shortcut Ctrl+Alt+X is already in use; choose another')});assert.deepEqual([...registered.keys()],['Control+Alt+A']);assert.deepEqual(events,[]);registered.get('Control+Alt+A')();assert.deepEqual(events,['old']);assert.throws(()=>registry.replace([['Control+Alt+A',()=>{}],['Alt+Control+A',()=>{}]]),{message:label('快捷键 Ctrl+Alt+A 不能重复','Shortcut Ctrl+Alt+A must not be used twice')});assert.deepEqual([...registered.keys()],['Control+Alt+A']);}finally{registry.clear();}
}));

test('stack preview, deduplication and stale-token protection retain original content and stored source',()=>both(async(_language,label)=>{
 const s=new a.Store(':memory:'),stack=new a.StackService(()=>s);try{const item=s.add({text:raw+'\n'+raw+'\n第二行'},source);stack.split(item.id);assert.equal(s.queue.length,2);for(const id of s.queue)assert.equal(s.get(id).source,'堆栈按行拆分');assert.deepEqual(s.queue.map(id=>s.get(id).payload.text),[raw,'第二行']);stack.split(item.id);assert.equal(s.queue.length,2);const preview=stack.preview('oldest');s.setQueue([]);assert.throws(()=>stack.commit(preview.token),{message:label('堆栈、规则或来源已变化，请重新预览','The stack, rules, or source changed; preview again')});assert.deepEqual(s.queue,[]);assert.throws(()=>stack.commit(preview.token),{message:label('批量预览已失效，请重新预览','The batch preview expired; preview again')});}finally{stack.cancel();s.close();}
}));

test('tray lookup keeps raw labels and stable category error code while expiring capabilities in both languages',()=>both(async(_language,label)=>{
 const s=new a.Store(':memory:');let now=1000;const tray=new a.TrayHistory(()=>s,()=>now);try{const item=s.add({text:raw},source);tray.open();const query=tray.query({text:'保存',kind:'all',category:''});assert.equal(query.total,1);const token=query.items[0].token;assert.equal(tray.preview(token).title,raw);assert.equal(tray.preview(token).text,raw);assert.throws(()=>tray.query({text:'',kind:'all',category:'00000000-0000-0000-0000-000000000001'}),e=>e.message.startsWith(a.TRAY_CATEGORY_MISSING+': '));now+=601000;assert.throws(()=>tray.resolve(token),{message:label('托盘预览已过期，请重新打开','The tray preview expired; reopen it')});tray.close();assert.throws(()=>tray.resolve(token),{message:label('托盘面板已关闭，请重新打开','The tray panel is closed; reopen it')});assert.equal(s.get(item.id).title,raw);}finally{tray.close();s.close();}
}));

test('attachment materialization preserves Unicode paths and bytes and cancels without changing existing files',()=>both(async(_language,label)=>{
 const root=await folder(),destination=path.join(root,'保存目录'),target=path.join(root,'未完成');await fs.mkdir(destination);await fs.mkdir(target);const attachments=[{name:'保存\\设置.txt',data:Buffer.from(raw).toString('base64')},{name:'空目录',data:'',directory:true}];
 try{await a.writeAttachmentTree(destination,attachments);assert.equal(await fs.readFile(path.join(destination,'保存','设置.txt'),'utf8'),raw);assert.equal((await fs.stat(path.join(destination,'空目录'))).isDirectory(),true);await assert.rejects(()=>a.writeAttachmentTree(destination,attachments),{message:label('附件目标目录必须为空','The attachment destination folder must be empty')});await assert.rejects(()=>a.writeAttachmentTree(target,attachments,()=>false),{message:label('附件操作已取消或历史已锁定','The attachment operation was canceled or history is locked')});assert.deepEqual(await fs.readdir(target),[]);assert.equal(await fs.readFile(path.join(destination,'保存','设置.txt'),'utf8'),raw);assert.throws(()=>a.validateAttachments([{name:'..\\outside',data:''}]),{message:label('附件文件名无效','Invalid attachment filename')});}finally{await cleanup(root);}
}));

test('appearance recovery and nested validators localize errors without changing settings or protocol identifiers',()=>both(async(_language,label)=>{
 const root=await folder(),file=path.join(root,'appearance.json');try{await fs.writeFile(file,'保存 invalid');const store=new a.AppearanceStore(file),state=await store.load();assert.equal(state.warning,label('外观设置无法读取，暂用默认值。保存后可重新建立外观设置。','Appearance settings could not be read. Defaults are in use; save to create the settings again.'));assert.equal(await fs.readFile(file,'utf8'),'保存 invalid');await store.save({font:'mono',scale:150,density:'compact'});assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{version:1,value:a.validateAppearance({font:'mono',scale:150,density:'compact'})});
  const check=(fn,zh,en)=>assert.throws(fn,{message:label(zh,en)});check(()=>a.validateAppearance({font:'invalid'}),'字体或密度设置无效','Invalid font or density settings');check(()=>a.validateDesktop(null),'桌面设置无效','Invalid desktop settings');check(()=>a.searchTerm('保存\n设置'),'搜索词须为最多 512 字的单行文字','The search term must be a single line of up to 512 characters');check(()=>a.validateFormats({},16),'原始格式列表无效','Invalid original format list');check(()=>a.validateMetadataTarget(null),'内部信息对象无效','Invalid metadata target');check(()=>a.recordingRange(null,0),'录制内容为空','The recording is empty');check(()=>a.validateTrayQuery(null),'托盘搜索条件无效','Invalid tray search filters');
  const formats=[{name:'HTML Format',data:Buffer.from(raw).toString('base64')}];assert.deepEqual(a.validateFormats(formats,1024),formats);assert.equal(a.formatDefinition('HTML Format').name,'HTML Format');assert.equal(a.metadataLabels.title,'标题');const metadata={category:'office',name:'保存.docx',size:123,fields:[{key:'title',value:raw}]};assert.deepEqual(a.validateMetadataResult(metadata),metadata);
 }finally{await cleanup(root);}
}));

test('history bilingual review records are captured from actual store outputs',async()=>{assert.equal(messages.length,2);await fs.mkdir('work/language-history',{recursive:true});await fs.writeFile('work/language-history/review-results.json',JSON.stringify({scope:'Actual isolated Store outputs; generated labels localize, user data remains literal',results:messages},null,2));});
