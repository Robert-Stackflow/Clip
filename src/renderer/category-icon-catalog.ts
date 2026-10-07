import {icons,type IconNode} from 'lucide';
import definitions from '../shared/category-icons.json';
/** Loaded separately so the complete SVG catalog stays out of the main renderer. */
export const categoryCatalog=Object.fromEntries(Object.entries(definitions).map(([name,exported])=>[name,icons[exported as keyof typeof icons]])) as Record<string,IconNode>;
