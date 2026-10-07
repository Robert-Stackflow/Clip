import definitions from './category-icons.json';
/** Canonical names from the installed Lucide version, shared by validation and UI. */
export type CategoryIcon=keyof typeof definitions;
export const categoryIcons=Object.keys(definitions) as CategoryIcon[];
export const categoryIconValid=(value:unknown):value is CategoryIcon=>typeof value==='string'&&Object.hasOwn(definitions,value);
