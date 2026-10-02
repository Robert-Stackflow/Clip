require('./renderer-fixture.cjs').setup(process.env.CLIPPER_VERIFY_LANGUAGE||'zh-CN');
require('./language-text-fixture.cjs').setupText();require('./language-data-fixture.cjs').setupData();require('./ui-028-fixture.cjs').extra();
const clips=window.fixture.state.clips,base=clips[0];for(let i=0;i<42;i++)clips.push({...base,id:'record-'+i,title:'记录 '+(i+1),favorite:false});
const trayState=window.clipperTray.state;window.clipperTray.state=async()=>({...await trayState(),total:clips.length});
const preview=window.clipperTray.preview;window.clipperTray.preview=async id=>({...await preview(id),text:('这是用于检查滚动条和内容布局的记录。\n').repeat(70)});
