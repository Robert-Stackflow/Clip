import snapshot from './reference-data/cheatsheets.json';
export type CheatBlock={type:'paragraph';text:string}|{type:'code';language:string;text:string}|{type:'table';header:string[];rows:string[][]}|{type:'list';ordered:boolean;start:number;items:CheatBlock[][]}|{type:'quote';blocks:CheatBlock[]}|{type:'divider'};
export type CheatSection={id:string;name:string;group:string;markdown:string;items:number;blocks:CheatBlock[]};
export type CheatTopic={id:string;label:string;source:string;markdown:string;sha256:string;sections:CheatSection[]};
export const cheatTopics=snapshot.topics as unknown as CheatTopic[];
export const cheatSource={repository:snapshot.repository,revision:snapshot.revision,license:snapshot.license};
