const {test}=require('node:test'),assert=require('node:assert/strict');
const {shortcutKey,validateSettings,defaults,validateDesktop,validateEfficiency,efficiencyDefaults,chatShortcut,chatOptions,quickShortcut}=require('../work/test-exports.cjs');

test('shortcut aliases, navigation keys and single Windows modifiers normalize to Electron accelerators',()=>{
 for(const [input,expected] of [['Win+F8','Super+F8'],['Meta+Shift+A','Shift+Super+A'],['ctrl+alt+space','Control+Alt+Space'],['Win+ArrowDown','Super+Down'],['Alt+Enter','Alt+Enter'],['Super+PageUp','Super+PageUp'],['Ctrl+A','Control+A']])assert.equal(shortcutKey(input),expected);
 for(const input of ['A','Win','Win+Meta+A','Ctrl+Control+A','Control++A','Control+Alt+F25','Control+Alt+?',null,''])assert.throws(()=>shortcutKey(input));
 assert.equal(shortcutKey('',true),'');
});

test('every configurable application shortcut accepts an explicit empty binding',()=>{
 const empty=validateSettings({...defaults,shortcut:'',nextShortcut:''});assert.equal(empty.shortcut,'');assert.equal(empty.nextShortcut,'');
 assert.equal(validateDesktop({shelfShortcut:''}).shelfShortcut,'');
 assert.equal(validateEfficiency({...efficiencyDefaults,repliesShortcut:''}).repliesShortcut,'');
 assert.equal(chatShortcut(''),'');assert.equal(chatOptions({shortcut:''}).shortcut,'');assert.equal(quickShortcut(''),'');
 assert.equal(chatOptions({}).shortcut,'Alt+Space');
 assert.throws(()=>quickShortcut(null));assert.throws(()=>validateDesktop({shelfShortcut:null}));
});
test('settings, chat, shelf and quick replies share shortcut validation and canonical duplicate checks',()=>{
 assert.equal(validateSettings({...defaults,shortcut:'Win+F8'}).shortcut,'Super+F8');
 assert.equal(validateDesktop({shelfShortcut:'Win+F9'}).shelfShortcut,'Super+F9');
 assert.equal(validateEfficiency({...efficiencyDefaults,repliesShortcut:'Win+F10'}).repliesShortcut,'Super+F10');
 assert.equal(chatShortcut('Win+Space'),'Super+Space');
 assert.throws(()=>validateSettings({...defaults,shortcut:'Win+Shift+F8',nextShortcut:'Shift+Super+F8'}),/相同/);
 assert.throws(()=>validateSettings({...defaults,shortcut:'Control+Control+V'}));
});
