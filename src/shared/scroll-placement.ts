interface Rect{x:number;y:number;width:number;height:number}
export function rectanglesOverlap(a:Rect,b:Rect){return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}
/** Dock beside the region, including another display; never obscure live input. */
export function scrollControlBounds(region:Rect,areas:Rect[],size:{width:number;height:number}):Rect|undefined{
 const gap=12,candidates=areas.flatMap(area=>[
  {x:region.x+region.width+gap,y:region.y},
  {x:region.x-size.width-gap,y:region.y},
  {x:region.x,y:region.y-size.height-gap},
  {x:region.x,y:region.y+region.height+gap},
  {x:area.x+gap,y:area.y+gap}
 ].map(p=>({...p,...size,area})));
 for(const {area,...rect} of candidates)if(rect.x>=area.x&&rect.y>=area.y&&rect.x+rect.width<=area.x+area.width&&rect.y+rect.height<=area.y+area.height&&!rectanglesOverlap(rect,region))return rect;
 return undefined;
}
