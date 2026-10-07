const {test}=require('node:test'),assert=require('node:assert/strict'),{emptyClipFilters,filterClips,filterDateRange,matchesClipFilters,normalizeClipFilters}=require('../work/test-clip-filters.cjs');
const day=24*60*60*1000,now=new Date(2026,9,5,15).getTime(),today=new Date(2026,9,5).getTime();
const clips=[
 {id:'text',kind:'text',source:'Code.exe',createdAt:today+1,favorite:true,pinned:false,tags:['Work'],bytes:20,title:'note',preview:''},
 {id:'file',kind:'files',source:'Explorer.exe',createdAt:today-day,favorite:false,pinned:true,tags:['work','archive'],bytes:2*1024*1024,title:'report.pdf',preview:''},
 {id:'image',kind:'image',source:'Snipaste.exe',createdAt:today-4*day,favorite:true,pinned:true,tags:[],bytes:12*1024*1024,title:'image',preview:''}
];
test('advanced clip filters combine all selected dimensions',()=>{
 const filters={...emptyClipFilters(),kinds:['files'],sources:['explorer.exe'],pinned:true,tags:['WORK'],extensions:['.pdf'],size:'medium'};
 assert.deepEqual(filterClips(clips,filters,now).map(clip=>clip.id),['file']);
});
test('date filters use local, non-overlapping day boundaries',()=>{
 assert.deepEqual(filterDateRange({...emptyClipFilters(),period:'today'},now),{from:today,to:today+day});
 assert.equal(matchesClipFilters(clips[0],{...emptyClipFilters(),period:'today'},now),true);
 assert.equal(matchesClipFilters(clips[1],{...emptyClipFilters(),period:'today'},now),false);
});
test('invalid and duplicate selections normalize before matching',()=>{
 const value=normalizeClipFilters({kinds:['text','text','unknown'],sources:[' CODE.EXE ','code.exe'],extensions:['.PDF','pdf']});
 assert.deepEqual(value.kinds,['text']);assert.deepEqual(value.sources,['code.exe']);assert.deepEqual(value.extensions,['pdf']);
});
