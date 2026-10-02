// One's native visibility controller: document.hidden does not reliably cover
// prewarmed or minimized Electron windows. Initial responses cannot undo events.
let visible=true,initialized=false;
const listeners=new Set<(visible:boolean)=>void>();
export const isWindowVisible=()=>visible;
export function onWindowVisibility(callback:(visible:boolean)=>void){listeners.add(callback);return()=>listeners.delete(callback);}
export function setupWindowVisibility(){
 if(initialized)return;initialized=true;const api=window.clipperChrome;if(!api)return;visible=false;let revision=0;
 const update=(state:{visible:boolean})=>{if(visible===state.visible)return;visible=state.visible;for(const callback of listeners)callback(visible);};
 api.onChange(state=>{revision++;update(state);});const request=revision;
 void api.state().then(state=>{if(request===revision)update(state);}).catch(()=>{});
}
