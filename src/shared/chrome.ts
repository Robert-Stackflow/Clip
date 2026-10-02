export interface WindowState {maximized:boolean;maximizable:boolean;minimizable:boolean;visible:boolean}
export interface WindowConfirmation{token:string;message:string;detail:string;buttons:string[];defaultId:number;cancelId:number}
export interface ChromeAPI {state():Promise<WindowState>;action(kind:'minimize'|'maximize'|'close'):Promise<void>;onChange(callback:(state:WindowState)=>void):()=>void;onConfirm(callback:(request:WindowConfirmation)=>void):()=>void;answerConfirm(token:string,response:number):Promise<void>}
