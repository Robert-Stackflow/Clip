chrome.action.onClicked.addListener(async tab=>{
 if(!tab.id)return;
 try{
  await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',files:['page.js']});
  await chrome.action.setBadgeBackgroundColor({tabId:tab.id,color:'#32845b'});
  await chrome.action.setBadgeText({tabId:tab.id,text:'ON'});
  await chrome.action.setTitle({tabId:tab.id,title:'已启用：将页面图片拖入 Clipper'});
 }catch{
  await chrome.action.setBadgeText({tabId:tab.id,text:'!'});
  await chrome.action.setTitle({tabId:tab.id,title:'此页面无法启用图片拖放，请在普通网页上使用'});
 }
});
