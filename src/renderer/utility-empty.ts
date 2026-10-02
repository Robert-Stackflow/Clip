import {createElement,type IconNode} from 'lucide';

export function utilityEmpty(label:string,glyph:IconNode){
 const node=document.createElement('div');node.className='utility-empty';
 node.append(createElement(glyph,{'class':'icon','aria-hidden':'true','stroke-width':1.5}));
 const caption=document.createElement('p');caption.textContent=label;node.append(caption);return node;
}
