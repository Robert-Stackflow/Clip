const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require('@playwright/test');

(async()=>{
 const code=(await require('esbuild').build({stdin:{contents:"import {resetDialogMotion,exitDialog,closeDialog} from './src/renderer/dialog-motion';window.motion={resetDialogMotion,exitDialog,closeDialog};",resolveDir:process.cwd()},bundle:true,write:false,platform:'browser'})).outputFiles[0].text;
 const css=(await fs.readFile('src/renderer/one-dialog.css','utf8'))+'\n'+(await fs.readFile('src/renderer/one-motion.css','utf8'));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({reducedMotion:'no-preference'});
  await page.setContent(`<style>:root{--ease:cubic-bezier(.2,.8,.2,1);--surface:white;--fg:black;--muted:#666;--line:#ddd;--panel-radius:18px}${css}</style><dialog class="one-dialog one-form-dialog"><p>确认操作</p></dialog>`);
  await page.addScriptTag({content:code});
  await page.evaluate(()=>{const dialog=document.querySelector('dialog');motion.resetDialogMotion(dialog);dialog.showModal();});
  await page.waitForTimeout(220);
  const result=await page.evaluate(async()=>{
   const dialog=document.querySelector('dialog');
   const exit=motion.exitDialog(dialog);
   await new Promise(resolve=>setTimeout(resolve,48));
   const before=Number(getComputedStyle(dialog).opacity);
   motion.resetDialogMotion(dialog);
   const captured=Number(dialog.style.getPropertyValue('--dialog-enter-opacity'));
   const after=Number(getComputedStyle(dialog).opacity);
   const canceled=await exit;
   await new Promise(resolve=>setTimeout(resolve,230));
   const stayedOpen=dialog.open&&!dialog.classList.contains('closing');
   await motion.closeDialog(dialog);
   return {before,captured,after,canceled,stayedOpen,closed:!dialog.open};
  });
  assert.ok(result.before>0&&result.before<.999,JSON.stringify(result));
  assert.ok(Math.abs(result.before-result.captured)<.08,JSON.stringify(result));
  assert.ok(Math.abs(result.before-result.after)<.16,JSON.stringify(result));
  assert.equal(result.canceled,false);
  assert.equal(result.stayedOpen,true);
  assert.equal(result.closed,true);
  await page.close();
  console.log('Dialog reversal remains continuous and cancels the stale close.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
