const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream'),{buildSync}=require('esbuild');
const code=buildSync({entryPoints:['src/main/win-v-shortcut.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
function fixture(){
 const children=[],failures=[];
 const spawn=(file,args)=>{const child=new EventEmitter();Object.assign(child,{file,args,stdout:new PassThrough(),stderr:new PassThrough(),stdin:new PassThrough(),writes:[],kill:()=>{child.killed=true;queueMicrotask(()=>child.emit('close',1));}});child.stdin.on('data',data=>child.writes.push(String(data)));child.stdin.on('finish',()=>queueMicrotask(()=>child.emit('close',0)));children.push(child);return child;};
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:name=>name==='node:child_process'?{spawn}:require(name),__dirname:'D:/Repositories/Clipper/dist/main',process:{pid:123},setTimeout,clearTimeout,console});
 const host=new module.exports.WinVShortcut(e=>failures.push(e)),line=(child,value)=>child.stdout.write(value+'\n');return {host,children,failures,line};
}
test('Win+V stays unavailable until native readiness, and ignores events without an active binding',async()=>{
 const f=fixture();let count=0;assert.equal(f.host.register(()=>count++),false);const startup=f.host.prepare(),child=f.children[0];assert(child.args.includes('--win-v'));f.line(child,'pressed 88 44');assert.equal(count,0);child.stdout.write('rea');child.stdout.write('dy\n');await startup;
 assert(f.host.register(()=>count++));f.line(child,'pressed 88 44');assert.equal(count,1);f.host.unregister();f.line(child,'pressed 88 44');assert.equal(count,1);assert(child.writes.includes('disable\n'));await f.host.stop();
});
test('recording and session suspension suppress native callbacks and only restore a still-registered binding',async()=>{
 const f=fixture();let count=0;const startup=f.host.prepare(),child=f.children[0];f.line(child,'ready');await startup;f.host.suspend(true);assert(f.host.register(()=>count++));f.line(child,'pressed 88 44');assert.equal(count,0);f.host.suspend(false);f.line(child,'pressed 88 44');assert.equal(count,1);f.host.unregister();f.host.suspend(true);f.host.suspend(false);f.line(child,'pressed 88 44');assert.equal(count,1);assert.equal(child.writes.at(-1),'disable\n');await f.host.stop();
});
test('unexpected native exit disables the binding, reports once and permits a fresh retry',async()=>{
 const f=fixture();let count=0;const startup=f.host.prepare(),child=f.children[0];f.line(child,'ready');await startup;f.host.register(()=>count++);child.emit('close',1);child.emit('error',Error('duplicate exit'));assert.equal(f.failures.length,1);assert.equal(f.host.register(()=>count++),false);f.line(child,'pressed 88 44');assert.equal(count,0);
 const retry=f.host.prepare(),next=f.children[1];f.line(next,'ready');await retry;assert(f.host.register(()=>count++));child.emit('close',0);f.line(next,'pressed 88 44');assert.equal(count,1);await f.host.stop();
});
test('failed startup does not commit a binding and clean stop releases the child pipe',async()=>{
 const f=fixture(),startup=f.host.prepare(),child=f.children[0];child.emit('error',Error('native binary missing'));await assert.rejects(startup,/Win\+V/);assert(child.killed);assert.equal(f.failures.length,0);assert.equal(f.host.register(()=>{}),false);
 const retry=f.host.prepare(),next=f.children[1];f.line(next,'ready');await retry;f.host.register(()=>{});await f.host.stop();assert(next.stdin.writableFinished);assert.equal(f.host.register(()=>{}),false);assert.equal(f.failures.length,0);
});
