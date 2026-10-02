import {t as tr} from '../shared/i18n';
const display=(key:string)=>key.replaceAll('Control','Ctrl').replaceAll('Super','Win');
export function setupShortcut(input:HTMLInputElement,toast:(error:unknown)=>void){
 input.readOnly=true;input.placeholder=tr('点击录入，Delete 清除');input.value=display(input.dataset.value||'');
 let recording=false;
 const end=()=>{if(!recording)return;recording=false;input.value=display(input.dataset.value||'');void window.clipper.recordShortcut(false).catch(toast);};
 input.onfocus=()=>{recording=true;input.value=tr('按下组合键…');void window.clipper.recordShortcut(true).catch(toast);};input.onblur=end;
 input.onkeydown=e=>{if(e.key==='Tab')return;e.preventDefault();e.stopPropagation();if(e.key==='Escape'){input.blur();return;}if(['Control','Alt','Shift','Meta'].includes(e.key))return;
  if(['Delete','Backspace'].includes(e.key)&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.shiftKey){input.dataset.value='';input.dispatchEvent(new Event('change',{bubbles:true}));input.blur();return;}
  const key=e.code.startsWith('Key')?e.code.slice(3):e.code.startsWith('Digit')?e.code.slice(5):e.key.toUpperCase();if(!/^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(key))return;
  const parts=[e.ctrlKey?'Control':'',e.altKey?'Alt':'',e.shiftKey?'Shift':'',e.metaKey?'Super':''].filter(Boolean);if(parts.length<2){input.value=tr('至少两个不同修饰键');return;}input.dataset.value=[...parts,key].join('+');input.dispatchEvent(new Event('change',{bubbles:true}));input.blur();
 };
 input.closest('dialog')?.addEventListener('close',end,{once:true});
}
