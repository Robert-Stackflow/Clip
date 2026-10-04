const koffi=require('koffi');
const user32=koffi.load('user32.dll');
const kernel32=koffi.load('kernel32.dll');
const countFormats=user32.func('int __stdcall CountClipboardFormats()');
const sequence=user32.func('uint32 __stdcall GetClipboardSequenceNumber()');
const setLastError=kernel32.func('void __stdcall SetLastError(uint32)');
const getLastError=kernel32.func('uint32 __stdcall GetLastError()');

function clipboardState(){
 setLastError(0);
 const formats=countFormats(),error=getLastError();
 if(formats===0&&error!==0)throw Error('Cannot verify whether the system clipboard is empty');
 const revision=sequence();
 if(revision===0)throw Error('Cannot verify the system clipboard sequence');
 return {formats,revision};
}

function requireEmptyClipboard(){
 const before=clipboardState();
 if(before.formats!==0)throw Error('Real-app test refused to replace a nonempty system clipboard');
 return {
  sequence:before.revision,
  assertUnchanged(){
   const current=clipboardState();
   if(current.revision!==before.revision||current.formats!==0)throw Error('System clipboard changed before the real-app test could copy');
  }
 };
}

module.exports={requireEmptyClipboard};
