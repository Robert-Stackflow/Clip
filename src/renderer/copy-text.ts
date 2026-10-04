export async function copyTextValue(value:string){
 try{await navigator.clipboard.writeText(value);}catch{
  const field=document.createElement('textarea');field.value=value;field.style.position='fixed';field.style.opacity='0';document.body.append(field);
  try{field.select();if(!document.execCommand('copy'))throw new Error('Clipboard unavailable');}finally{field.remove();}
 }
}
