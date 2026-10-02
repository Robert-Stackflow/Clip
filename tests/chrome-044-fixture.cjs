function prepare(){
 const base=window.clipper,model=fixture.state.clips[0],kinds=['text','image','files','link','code'];
 fixture.state.clips=Array.from({length:90},(_,i)=>({...model,id:'row-'+i,hash:'hash-'+i,kind:kinds[i%kinds.length],title:'Record '+i,preview:'Preview '+i,source:'Fixture.exe',favorite:true,tags:[]}));
 fixture.state.categories=[{id:'work',name:'Work',color:'#7893b4'},{id:'personal',name:'Personal',color:'#bd8367'}];
 fixture.state.queue=['row-0','row-1','row-0'];fixture.state.shelf=fixture.state.clips.map(c=>c.id);
 window.chromeProbe={pending:[],batches:[],clear:0,blocking:false};
 window.clipper=new Proxy({
  preview:async id=>({...fixture.state.clips.find(c=>c.id===id),payload:{text:'Complete '+id,files:['E:\\PrivateFixture\\file.txt']}}),
  snippetPreview:async id=>({...fixture.state.snippets.find(c=>c.id===id),revision:1,text:'Complete quick reply',payload:{text:'Complete quick reply'}}),
  batch:async(ids,action,tags)=>{chromeProbe.batches.push({ids,action,tags});if(chromeProbe.blocking)await new Promise(resolve=>chromeProbe.pending.push(resolve));},
  search:async()=>fixture.state.clips.map(c=>c.id),
  clearQueue:async()=>{chromeProbe.clear++;fixture.state.queue=[];fixture.refresh();}
 },{get:(o,k)=>k in o?o[k]:base[k]});
}

/** Runs only inside a private renderer, with synthetic DOM events. */
async function regressionProbe(){
 const wait=async fn=>{const start=performance.now();while(!fn()){if(performance.now()-start>10000)throw Error('Regression timeout');await new Promise(r=>setTimeout(r,10));}};
 await wait(()=>document.querySelector('#filters button')&&document.querySelector('.preview-body'));
 const all=document.querySelector('[data-kind=all]'),text=document.querySelector('[data-kind=text]');all.focus();all.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
 await wait(()=>document.querySelector('[data-kind=text]').getAttribute('aria-pressed')==='true');
 const filterFocus=document.activeElement===text&&all===document.querySelector('[data-kind=all]');
 const category=document.querySelector('[data-category=work]');category.focus();fixture.state.categories[0].name='Renamed';fixture.refresh();await wait(()=>document.querySelector('[data-category=work]').textContent==='Renamed');
 const categoryFocus=document.activeElement===category&&category===document.querySelector('[data-category=work]');
 document.querySelector('[data-page=history]').click();document.getElementById('batch-mode').click();
 const select=id=>{const box=document.querySelector('[data-check="'+id+'"]');box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));};select('row-0');chromeProbe.blocking=true;
 const operation=document.getElementById('batch-favorite');operation.click();await wait(()=>chromeProbe.pending.length===1);select('row-1');
 const batchLock=document.getElementById('batch-favorite')===operation&&operation.disabled;
 chromeProbe.blocking=false;chromeProbe.pending.shift()();await wait(()=>!operation.hasAttribute('aria-busy'));
 document.querySelector('[data-page=stack]').click();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
 const stackGroup=!document.getElementById('filters').classList.contains('tabs')&&!document.getElementById('filters').classList.contains('segment-ready');
 return {filterFocus,categoryFocus,batchLock,stackGroup};
}

async function probe(){
 const results=[],check=(name,condition)=>{if(!condition)throw Error(name);results.push(name);},wait=async fn=>{const start=performance.now();while(!fn()){if(performance.now()-start>10000)throw Error('Chrome probe timeout');await new Promise(r=>setTimeout(r,10));}},frames=async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);};
 const nav=page=>document.querySelector('[data-page='+page+']').click(),key=(button,value)=>button.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true})),filter=k=>document.querySelector('[data-kind='+k+']');
 await wait(()=>document.querySelector('.preview-body'));await frames();
 for(const page of ['history','favorites','shelf','category:work']){
  if(page.startsWith('category'))document.querySelector('[data-category=work]').click();else nav(page);
  await wait(()=>document.querySelector('.preview-body'));await frames();
  const group=document.getElementById('filters'),buttons=Array.from(group.children);buttons[0].focus();key(buttons[0],'ArrowRight');await frames();
  check(page+' arrow retains One buttons, focus and selected state',buttons.every(b=>b===filter(b.dataset.kind))&&document.activeElement===buttons[1]&&buttons[1].getAttribute('aria-pressed')==='true'&&buttons.filter(b=>b.tabIndex===0).length===1&&buttons[1].tabIndex===0);
  const pseudo=getComputedStyle(group,'::before'),x=parseFloat(group.style.getPropertyValue('--segment-x'));check(page+' indicator follows selection using One borderless geometry',Math.abs(x-buttons[1].offsetLeft)<1&&pseudo.transitionDuration==='0.22s, 0.22s, 0.22s'&&buttons.every(b=>getComputedStyle(b).borderTopWidth==='0px'));
  key(buttons[1],'End');await frames();check(page+' End preserves focus and code filtering',document.activeElement===buttons[5]&&buttons[5].getAttribute('aria-pressed')==='true'&&Array.from(document.querySelectorAll('.clip-row')).every(row=>fixture.state.clips.find(c=>c.id===row.dataset.id).kind==='code'));
  key(buttons[5],'ArrowRight');await frames();key(buttons[0],'ArrowLeft');await frames();key(buttons[5],'Home');await frames();check(page+' wrap and Home keep focus and row actions',document.activeElement===buttons[0]&&buttons[0].getAttribute('aria-pressed')==='true'&&buttons.every(b=>b===filter(b.dataset.kind)));
 }
 nav('history');await frames();const category=document.querySelector('[data-category=work]'),heading=document.querySelector('.category-heading'),add=document.getElementById('add-category');category.focus();fixture.state.categories.unshift({id:'new',name:'New',color:'#7893b4'});fixture.state.categories.find(c=>c.id==='work').name='Updated Work';fixture.refresh();await wait(()=>document.querySelector('[data-category=work]').textContent==='Updated Work');
 check('Category insertion and rename retain focus, heading and add button',document.activeElement===category&&category===document.querySelector('[data-category=work]')&&heading===document.querySelector('.category-heading')&&add===document.getElementById('add-category'));
 fixture.state.categories.reverse();fixture.refresh();await wait(()=>document.querySelector('#categories > button').dataset.category==='personal');check('Category reorder preserves keyboard target',document.activeElement===category&&category===document.querySelector('[data-category=work]'));
 category.click();await wait(()=>document.querySelector('.page-heading h1').textContent==='Updated Work');check('Retained category click uses current label and navigation',category.classList.contains('selected')&&document.querySelector('#filters button').getAttribute('aria-pressed')==='true');
 nav('history');document.getElementById('batch-mode').click();await frames();
 const select=id=>{const box=document.querySelector('[data-check="'+id+'"]');box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));};select('row-0');const batch=document.getElementById('batch-favorite'),all=document.getElementById('batch-all');batch.focus();select('row-1');
 check('Selected count update retains batch controls and focus',batch===document.getElementById('batch-favorite')&&all===document.getElementById('batch-all')&&document.activeElement===batch&&document.querySelector('#batch-bar > span').textContent.includes('2'));
 chromeProbe.blocking=true;batch.click();await wait(()=>chromeProbe.pending.length===1);await new Promise(r=>setTimeout(r,180));const icon=batch.firstElementChild;select('row-2');batch.click();
 check('Count update preserves pending lock and spinner, executes once',batch===document.getElementById('batch-favorite')&&batch.disabled&&batch.firstElementChild===icon&&batch.classList.contains('action-pending')&&getComputedStyle(batch,'::after').animationName!=='none'&&chromeProbe.batches.length===1);
 check('Pending batch acts on its original selection snapshot',JSON.stringify(chromeProbe.batches[0].ids)===JSON.stringify(['row-0','row-1']));
 chromeProbe.blocking=false;chromeProbe.pending.shift()();await wait(()=>!batch.hasAttribute('aria-busy'));select('row-3');batch.click();await wait(()=>chromeProbe.batches.length===2);
 check('Retained batch action uses latest selection after completion',JSON.stringify(chromeProbe.batches[1].ids)===JSON.stringify(['row-3']));
 document.getElementById('batch-mode').click();nav('stack');await frames();const group=document.getElementById('filters'),clear=document.getElementById('clear-queue'),run=document.getElementById('stack-running'),runIcon=run.firstElementChild;clear.focus();fixture.state.queue.push('row-2');fixture.refresh();await wait(()=>document.querySelector('#filters .filter-note').textContent.includes('4'));
 const stackObserved={tabs:group.classList.contains('tabs'),indicator:group.classList.contains('segment-ready'),clear:clear===document.getElementById('clear-queue'),focus:document.activeElement===clear,icon:run.firstElementChild===runIcon,tabIndex:clear.tabIndex};
 check('Stack status and clear use a plain toolbar, retain focus and icon '+JSON.stringify(stackObserved),!stackObserved.tabs&&!stackObserved.indicator&&stackObserved.clear&&stackObserved.focus&&stackObserved.icon&&stackObserved.tabIndex===0);
 clear.click();await wait(()=>document.querySelector('dialog[open]'));check('Retained clear opens the shared One dialog',!!document.querySelector('.one-dialog[open]'));
 document.getElementById('modal-close').click();await wait(()=>!document.querySelector('dialog[open]'));
 fixture.state.queue=[];fixture.refresh();await wait(()=>!document.getElementById('clear-queue'));check('Empty stack removes only its unavailable clear action',document.querySelector('#filters .filter-note').textContent.includes('0')&&!group.classList.contains('tabs'));
 nav('replies');await frames();check('Quick replies omit the empty filter row',document.querySelector('.filterbar').hidden&&!document.getElementById('filters').classList.contains('tabs'));
 return results;
}
module.exports={prepare,probe,regressionProbe};
