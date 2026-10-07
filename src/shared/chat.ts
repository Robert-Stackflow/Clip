import {t as tr} from './i18n';
import {reasoningEffort,type AIModel,type AISelection,type AIProfileView} from './text-tools';
import type {TextCommand,CommandInvocation} from './commands';
import {shortcutKey} from './shortcut';
export interface ChatImage {name:string;png:string}
export interface ChatDraft extends AISelection {text:string;images:ChatImage[];commandId:string;language:string;values:Record<string,string>}
export interface ChatMessage {id:string;role:'user'|'assistant';text:string;createdAt:number;status:'complete'|'running'|'failed'|'cancelled';images?:ChatImage[];prompt?:string;commandTitle?:string;error?:string;model?:string;profileId?:string;requestId?:string}
export interface ChatConversation {id:string;title:string;renamed?:boolean;updatedAt:number;profileId:string;messages:ChatMessage[];draft:ChatDraft}
export interface ChatSummary {id:string;title:string;updatedAt:number;bytes:number;running:boolean}
export interface ChatOptions {shortcut:string;onTop:boolean;keepOpen:boolean}
export interface ChatState {conversation:ChatConversation;history:ChatSummary[];profiles:AIProfileView[];commands:TextCommand[];defaultId:string;dark:boolean;canPaste:boolean;options:ChatOptions;sidebarOpen:boolean;shortcutAvailable:boolean;development:boolean}
export interface ChatSend extends AISelection {conversationId:string;profileId:string;revision:string;approvedDestination:string;text:string;images:ChatImage[];language:string;command?:CommandInvocation}
export type ChatEvent={type:'changed'}|{type:'delta';conversationId:string;messageId:string;delta:string;offset:number};
export interface ChatWireMessage {role:'system'|'user'|'assistant';content:string;images?:ChatImage[]}
export interface ChatAPI {
 state(id?:string):Promise<ChatState>;create():Promise<string>;remove(id:string):Promise<void>;rename(id:string,title:string):Promise<void>;draft(id:string,draft:ChatDraft,profileId:string):Promise<void>;
 send(value:ChatSend):Promise<void>;cancel(id:string):Promise<void>;retry(id:string,profileId:string,revision:string,destination:string,selection?:AISelection):Promise<void>;
 image(data:string,name:string):Promise<ChatImage>;chooseImages():Promise<ChatImage[]>;records():Promise<{id:string;title:string;kind:string;source:string}[]>;record(id:string):Promise<{text:string;images:ChatImage[]}>;
 apply(id:string,messageId:string,mode:'copy'|'paste'|'save'):Promise<void>;configure(value:Partial<ChatOptions>):Promise<void>;hide():Promise<void>;main():Promise<void>;
 copyText(text:string):Promise<void>;sidebar(open:boolean):Promise<void>;
 models(profileId:string,requestId:string):Promise<AIModel[]>;cancelModels(requestId:string):Promise<void>;
 openURL(url:string):Promise<void>;onEvent(callback:(event:ChatEvent)=>void):()=>void;onShow(callback:()=>void):()=>void;
}
export const emptyChatDraft=():ChatDraft=>({text:'',images:[],commandId:'',language:'简体中文',values:{}});
export function chatShortcut(value:unknown):string {
 return shortcutKey(value);
}
export function chatOptions(value:unknown):ChatOptions {
 const v=value as Partial<ChatOptions>;if(!v||typeof v!=='object'||Array.isArray(v)||['onTop','keepOpen'].some(key=>v[key as keyof ChatOptions]!==undefined&&typeof v[key as keyof ChatOptions]!=='boolean'))throw new Error(tr('对话窗口设置无效'));
 return {shortcut:chatShortcut(v.shortcut??'Alt+Space'),onTop:v.onTop??true,keepOpen:v.keepOpen??true};
}
export function chatImages(value:unknown):ChatImage[]{
 if(!Array.isArray(value)||value.length>4)throw new Error(tr('每条消息最多添加 4 张图片'));let total=0;
 return value.map(item=>{if(!item||typeof item.name!=='string'||item.name.length>120||typeof item.png!=='string'||!/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(item.png))throw new Error(tr('图片格式无效'));total+=item.png.length;if(total>22*1024*1024)throw new Error(tr('图片总大小超过 16 MiB'));return {name:item.name,png:item.png};});
}
export function chatDraft(value:unknown):ChatDraft {
 const v=value as ChatDraft;if(!v||typeof v.text!=='string'||new TextEncoder().encode(v.text).length>256*1024||typeof v.commandId!=='string'||v.commandId.length>80||typeof v.language!=='string'||!v.language.trim()||v.language.length>60||!v.values||typeof v.values!=='object'||Array.isArray(v.values)||Object.keys(v.values).length>16||Object.entries(v.values).some(([key,text])=>! /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(key)||typeof text!=='string'||text.length>4000))throw new Error(tr('对话输入无效或过长'));
 if(v.modelId!==undefined&&(typeof v.modelId!=='string'||v.modelId.length>200||/[\r\n]/.test(v.modelId)))throw new Error(tr('模型 ID 无效'));reasoningEffort(v.reasoningEffort);
 return {text:v.text,images:chatImages(v.images),commandId:v.commandId,language:v.language,values:{...v.values},...(v.modelId!==undefined?{modelId:v.modelId}:{}),...(v.reasoningEffort!==undefined?{reasoningEffort:v.reasoningEffort}:{})};
}
