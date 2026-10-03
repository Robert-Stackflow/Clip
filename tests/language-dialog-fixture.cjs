function setupDialogs(){
 const api=window.clipper,language=window.clipperLanguage.current,english=language==='en',calls=[];
 const options={historyEnabled:true,repliesShortcut:'Control+Alt+R',bindings:[]},history=['设置 保存','<img id="injected-search">'];
 fixture.calls=calls;fixture.efficiency={options,history};fixture.state.snippets[0].title='保存 {{姓名}}';fixture.state.snippets[0].text='你好 {{姓名}} · {{日期}} {{时间}}';fixture.state.snippets[0].payload={text:fixture.state.snippets[0].text};
 fixture.desktop={dockEnabled:true,dockEdge:'left',dwellMs:450,displayId:null,autoHide:true,shelfTop:true,shelfOnTop:true,shelfShortcut:'Control+Alt+D',cardDirection:'grid'};
 const record=(name,result=null)=>(...args)=>{calls.push([name,...args]);return Promise.resolve(typeof result==='function'?result(...args):result);};
 const data={formats:[{name:'PNG',label:english?'PNG image':'PNG 图像',bytes:123456,exportable:true},{name:'Rich Text Format',label:english?'RTF rich text':'RTF 富文本',bytes:1234,exportable:true}],image:{width:640,height:360},sourceUrl:'https://资料.test/保存?主题=中文',attachments:[{index:0,name:'资料\\保存.txt',directory:false,bytes:2048,modified:1700000000000,created:1600000000000}],files:[{name:'中文 文件.txt',path:'D:\\资料\\中文 文件.txt',type:english?'Document':'文档',bytes:4096,modified:1700000000000,status:'not-read'}]};
 const overrides={
  efficiencyState:async()=>({options,history}),configureEfficiency:record('efficiency-save',value=>Object.assign(options,value)),removeSearch:record('remove-search',query=>{if(query===null)history.length=0;else history.splice(history.indexOf(query),1);}),rememberSearch:record('remember-search'),search:record('search',()=>fixture.state.clips.map(c=>c.id)),recordShortcut:record('record-shortcut'),category:record('category-save'),snippet:record('snippet-save'),useSnippet:record('snippet-use'),resolveReply:record('reply-resolve'),
  desktopState:async()=>({options:fixture.desktop,displays:[{id:7,name:'显示器 保存'}]}),configureDesktop:record('desktop-save',value=>Object.assign(fixture.desktop,value)),showTray:record('show-tray'),
  stackState:async()=>fixture.state.stack,configureStack:record('stack-save',value=>fixture.state.stack.options=value),previewStack:record('stack-preview',order=>({token:'stack-preview-token',matched:7,added:3,duplicates:4,samples:['保存 设置','<img id="injected-stack">','中文路径 D:\\资料']})),commitStack:record('stack-commit',3),cancelStackPreview:record('stack-cancel'),
  ocrStatus:async()=>({languages:[{tag:'zh-Hans-CN',name:'简体中文'},{tag:'en-US',name:'English'}]}),ocr:record('ocr',()=>({text:'保存 识别输出',scaled:false})),cancelOcr:record('ocr-cancel'),saveOcr:record('ocr-save','text'),screens:async()=>[{id:7,name:'显示器 保存',width:1920,height:1080}],captureWindows:async()=>[{token:'window-token',name:'窗口 保存 {{日期}}',thumbnail:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4J8AAAAASUVORK5CYII='}],screenshot:record('screenshot','image'),screenshotWindow:record('window-capture','image'),openScrollCapture:record('scroll-capture'),
  contentInfo:record('content-info',(_id,read)=>({...data,files:data.files.map(file=>({...file,status:read?'available':'not-read'}))})),exportFormat:record('export-format','保存.rtf'),exportAttachment:record('export-attachment','保存.txt'),metadata:record('metadata',request=>({category:'office',name:'保存文档.docx',size:12345,fields:[{key:'author',value:'保存 设置'},{key:'subject',value:'主题 原文'},{key:'title',value:'<img id="injected-metadata">'},...(request.includeLocation?[{key:'latitude',value:'12.34'}]:[])]})),cancelMetadata:record('metadata-cancel')
 };
 window.clipper=new Proxy(overrides,{get:(object,key)=>key in object?object[key]:api[key]});
}
async function openDialog(page,name){
 if(name==='category')await page.locator('#add-category').click();
 else if(name==='reply'){await page.locator('[data-page="replies"]').click();await page.locator('#new-reply').click();}
 else if(name==='reply-fill'){await page.locator('[data-page="replies"]').click();await page.locator('#paste').click();}
 else if(name==='reply-image'){await page.locator('[data-id="image"]').click();await page.locator('.detail-more').evaluate(el=>el.open=true);await page.locator('#save-reply').click();}
 else if(name==='ocr'){await page.locator('[data-id="image"]').click();await page.locator('.detail-more').evaluate(el=>el.open=true);await page.locator('#ocr').click();await page.waitForFunction(()=>!document.getElementById('ocr-run').disabled);}
 else if(name==='capture')await page.locator('#take-screenshot').click();
 else if(name==='search')await page.locator('#search-history').click();
 else if(name==='stack-rules'||name==='stack-batch'){await page.locator('[data-page="stack"]').click();await page.locator('#'+name).click();if(name==='stack-batch'){await page.locator('#stack-preview').click();await page.waitForFunction(()=>!document.querySelector('dialog [type=submit]').disabled);}}
 else if(name==='formats'||name==='metadata'){await page.locator('.detail-more').evaluate(el=>el.open=true);await page.locator('#content-info').click();await page.waitForSelector('#metadata-tab');if(name==='metadata'){await page.locator('#metadata-tab').click();await page.locator('#metadata-read').click();await page.waitForSelector('#metadata-values dd');}}
 else throw Error('Unknown dialog: '+name);
 await page.waitForSelector('dialog[open]');
}
module.exports={setupDialogs,openDialog};
