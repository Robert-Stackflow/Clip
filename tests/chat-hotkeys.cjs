const {test}=require('node:test'),assert=require('node:assert/strict');
const {HotkeyRegistry,chatShortcut}=require('../work/test-exports.cjs');
test('all shortcut entry points support one modifier, Space and Windows combinations',()=>{
 const registered=new Map(),registry=new HotkeyRegistry({register:(key,fn)=>{registered.set(key,fn);return true;},unregister:key=>registered.delete(key)});let count=0;
 registry.replace([['Win+F8',()=>count++],['Alt+Space',()=>count++,'chat']]);assert(registered.has('Super+F8'));registered.get('Super+F8')();registered.get('Alt+Space')();assert.equal(count,2);registry.replace([['Alt+Space',()=>count++]]);
 assert.equal(chatShortcut('Shift+Control+A'),'Control+Shift+A');assert.throws(()=>registry.replace([['Control+Shift+A',()=>{}],['Shift+Control+A',()=>{},'chat']]),/重复/);assert(registered.has('Alt+Space'));registry.clear();
});
