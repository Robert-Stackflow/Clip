import type {Clip} from './types';
/** Keep queue slot identity while filtering, without comparing every slot to every row. */
export function collectionItems(clips:readonly Clip[],byID:ReadonlyMap<string,Clip>,page:string,queue:readonly string[],shelf:readonly string[],kind:string,matches:ReadonlySet<string>|null,source=''){
 const accept=(clip:Clip)=>(!source||clip.source.trim().toLowerCase()===source)&&(kind==='all'||clip.kind===kind)&&(!matches||matches.has(clip.id));
 const items:Clip[]=[],indices:number[]=[];
 if(page==='stack'||page==='shelf'){
  const ids=page==='stack'?queue:shelf;
  for(let index=0;index<ids.length;index++){const clip=byID.get(ids[index]);if(clip&&accept(clip)){items.push(clip);if(page==='stack')indices.push(index);}}
 }else {const excluded=page==='history'?new Set(shelf):undefined;for(const clip of clips)if(!excluded?.has(clip.id)&&(page!=='favorites'||clip.favorite)&&accept(clip))items.push(clip);}
 return {items,indices};
}
