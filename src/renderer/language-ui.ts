import {t} from '../shared/i18n';
import {validateLanguageChoice,type LanguageChoice} from '../shared/language';
interface Context{active?():boolean;modal(title:string,body:string,onSave:()=>Promise<void>,save?:string):void;toast(value:unknown):void}
// Endonyms remain readable while the user is choosing a different UI language.
const label=(value:LanguageChoice)=>value==='zh-CN'?'简体中文':value==='en'?'English':t('跟随系统');
export async function languageUI(ctx:Context){const state=await window.clipperLanguage!.state();
 if(ctx.active&&!ctx.active())return;ctx.modal(t('界面语言'),`${state.warning?`<p class="warning">${t('语言设置无法读取，暂用简体中文。保存后可重新建立设置。')}</p>`:''}<label class="field">${t('选择界面语言')}<select id="interface-language">${(['zh-CN','en','system'] as const).map(value=>`<option value="${value}">${label(value)}</option>`).join('')}</select></label>`,async()=>{const value=validateLanguageChoice((document.getElementById('interface-language') as HTMLSelectElement).value),next=await window.clipper.configureLanguage(value);ctx.toast(t(next.restartRequired?'语言设置已保存，下次启动生效。':'无需重启，当前语言已生效。'));},t('保存'));
 const select=document.getElementById('interface-language') as HTMLSelectElement;if(!select)return;select.value=state.choice;
}
