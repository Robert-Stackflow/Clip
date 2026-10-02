import {setInterfaceLanguage,t as tr} from '../shared/i18n';
self.onmessage=(event:MessageEvent)=>{
 try{
  const {text,language}=event.data;setInterfaceLanguage(language);
  if(typeof text!=='string')throw new Error(tr('内容无效'));
  // Same line preparation as One code-worker; the stored clipboard remains unchanged.
  self.postMessage({lines:text.split(/\r\n|\r|\n/)});
 }catch(error){self.postMessage({error:(error as Error).message});}
};
