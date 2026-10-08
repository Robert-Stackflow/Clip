const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),{transformSync}=require('esbuild');
const source=fs.readFileSync('src/main/native.ts','utf8');
function nativeFixture(){
 const state={foreground:100,focus:201,attached:[],focused:[],sent:[],alive:true,activate:true};
 const functions={GetForegroundWindow:()=>state.foreground,GetWindowThreadProcessId:(hwnd,pid)=>{pid[0]=hwnd===100?process.pid:123;return hwnd===100?1:2;},GetCurrentThreadId:()=>1,IsWindow:hwnd=>!!hwnd&&(hwnd!==201||state.alive),GetAncestor:hwnd=>hwnd===201?200:hwnd,
  AttachThreadInput:(a,b,on)=>{state.attached.push([a,b,on]);return true;},SetForegroundWindow:hwnd=>{if(state.activate)state.foreground=hwnd;return state.activate;},SetFocus:hwnd=>{state.focused.push(hwnd);state.focus=hwnd;return 201;},GetAsyncKeyState:()=>0,SendInput:(count,input,size)=>{state.sent.push({count,input:Buffer.from(input),size});return count;},
  GetGUIThreadInfo:(_thread,info)=>{info.writeUInt32LE(1,4);info.writeBigUInt64LE(BigInt(state.focus),16);info.writeBigUInt64LE(201n,48);info.writeInt32LE(4,56);info.writeInt32LE(8,60);info.writeInt32LE(5,64);info.writeInt32LE(28,68);return true;},GetWindowRect:(_hwnd,b)=>{b.writeInt32LE(100,0);b.writeInt32LE(200,4);b.writeInt32LE(900,8);b.writeInt32LE(800,12);return true;},ClientToScreen:(_hwnd,p)=>{p.writeInt32LE(p.readInt32LE(0)+100,0);p.writeInt32LE(p.readInt32LE(4)+200,4);return true;},OpenProcess:()=>0};
 const module={exports:{}},requireMock=name=>name==='koffi'?{load:()=>({func:signature=>functions[signature.match(/__stdcall\s+(\w+)/)[1]]||(()=>0)})}:name.endsWith('/i18n')?{t:value=>value}:name.endsWith('/clipboard-blocks')?{}:{};
 vm.runInNewContext(transformSync(source,{loader:'ts',format:'cjs'}).code,{module,exports:module.exports,require:requireMock,process,Buffer,setTimeout});module.exports.initNative();
 return {state,native:module.exports};
}
test('Native paste captures and restores the Chromium child focus and detaches input queues',async()=>{
 const {state,native}=nativeFixture(),target=native.capturePasteTarget(200);assert.equal(target.focus,201);state.foreground=200;assert.deepEqual(JSON.parse(JSON.stringify(native.nativeCaretBounds(200))),{x:104,y:208,width:1,height:20});
 state.foreground=100;state.focus=0;let dismissed=false;await native.pasteTo(target.hwnd,()=>true,()=>{dismissed=true;assert.equal(state.foreground,200);},target.focus);
 assert(dismissed);assert.deepEqual(state.focused,[201]);assert.deepEqual(state.attached,[[1,2,true],[1,2,false]]);assert.equal(state.sent.length,1);assert.equal(state.sent[0].size,40);
 assert.deepEqual(Array.from({length:4},(_,i)=>[state.sent[0].input.readUInt16LE(i*40+8),state.sent[0].input.readUInt32LE(i*40+12)]),[[17,0],[86,0],[86,2],[17,2]]);
});
test('Paste never focuses a destroyed or unrelated child, or sends keys after refused activation or cancellation',async()=>{
 for(const focus of [999,201]){const {state,native}=nativeFixture();state.alive=false;await native.pasteTo(200,()=>true,()=>{},focus);assert.equal(state.focused.length,0);}
 const refused=nativeFixture();refused.state.activate=false;await assert.rejects(refused.native.pasteTo(200),/恢复目标窗口/);assert.equal(refused.state.sent.length,0);
 const cancelled=nativeFixture();let valid=true;await assert.rejects(cancelled.native.pasteTo(200,()=>valid,()=>{valid=false;},201),/取消/);assert.equal(cancelled.state.sent.length,0);
});
test('A non-activating panel pastes without touching an editor whose focus was preserved',async()=>{
 const {state,native}=nativeFixture();state.foreground=200;await native.pasteTo(200,()=>true,()=>{},201);
 assert.deepEqual(state.focused,[]);assert.deepEqual(state.attached,[]);assert.equal(state.sent.length,1);
});
function mainFunctions(names,context){const file=ts.createSourceFile('index.ts',fs.readFileSync('src/main/index.ts','utf8'),ts.ScriptTarget.Latest,true),code=file.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.includes(node.name?.text)).map(node=>node.getText(file)).join('\n');return vm.runInNewContext(ts.transpile(code)+'\n({'+names.join(',')+'})',context);}
test('Protected sessions and data operations block panels and replies',()=>{
 const context={updateService:{},programRollback:{},secured:false,quitting:false,systemPaused:false,changingStore:false,recordingShortcut:false};
 const functions=mainFunctions(['panelsBlocked','repliesBlocked'],context);assert(!functions.panelsBlocked());assert(!functions.repliesBlocked());
 for(const flag of ['secured','quitting','systemPaused','changingStore','recordingShortcut']){context[flag]=true;assert(functions.panelsBlocked());context[flag]=false;}
 context.updateService.installing=true;assert(functions.panelsBlocked());
});
test('Explicit Win+V prepares the native hook even when the additional interception option is off',async()=>{
 let shortcut='Super+V',intercept=false,prepared=0,stopped=0;const context={developmentHidden:false,store:{meta:key=>key==='quick-panel-shortcut'?shortcut:intercept},quickShortcut:value=>value,QUICK_SHORTCUT:'Control+Alt+V',winVShortcut:{prepare:async()=>{prepared++;},stop:async()=>{stopped++;}}};
 const functions=mainFunctions(['needsWinV','prepareWinVShortcut'],context);await functions.prepareWinVShortcut();assert.equal(prepared,1);assert.equal(stopped,0);
 shortcut='Control+Alt+V';await functions.prepareWinVShortcut();assert.equal(stopped,1);intercept=true;await functions.prepareWinVShortcut();assert.equal(prepared,2);
});
