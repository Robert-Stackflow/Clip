export interface WebOptions {host:string;minutes:number;follow:boolean}
export interface WebItem {id:string;title:string;preview:string;image:boolean;bytes:number}
export interface WebState {running:boolean;addresses:string[];origin:string;invitation:string;inviteExpires:number;expires:number;fingerprint:string;follow:boolean;error:string;items:(WebItem&{clipId:string})[];clients:{id:string;name:string;host:string;code:string;approved:boolean;allowSend:boolean}[]}
export interface WebClientState {approved:boolean;name:string;code:string;allowSend:boolean;expires:number;revision:number;items:WebItem[]}
export const isInvitation=(text:string)=>text.startsWith('clip-pair:')||text.includes('#clip-web=');
