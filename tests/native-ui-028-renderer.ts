import {applyAppearance} from '../src/renderer/appearance';
import {windowControls,setupChrome} from '../src/renderer/chrome';
import {setupFontPicker} from '../src/renderer/font-picker';
document.querySelector('header')!.innerHTML='Clipper'+windowControls();setupChrome();
setupFontPicker(document.getElementById('appearance-font') as HTMLButtonElement);
document.getElementById('appearance-font')!.addEventListener('change',async()=>{const state=await window.clipperAppearance!.state();applyAppearance({...state.value,font:(document.getElementById('appearance-font') as HTMLInputElement).value as typeof state.value.font});});
