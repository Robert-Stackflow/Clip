import type {DatabaseConnection} from './database';
/** SQL projection never returns base64 or rich-format bodies to JavaScript. */
export function payloadProjection(row:string,includeText=true){
 // Materialize one parsed JSONB document for all fields. Byte lengths retain legacy unpadded base64 semantics.
 const decodeSize=(field:string)=>`octet_length(rtrim(${field},'='))*3/4`;
 const original=row;row='doc';const binarySize=decodeSize("json_extract(value,'$.data')");
 return `(WITH clipper_projection(doc) AS MATERIALIZED (SELECT jsonb(${original})) SELECT json_object(${includeText?`'text',json_extract(${row},'$.payload.text'),`:''}
 'files',json_extract(${row},'$.payload.files'),
 'attachments',CASE WHEN json_type(${row},'$.payload.attachments')='array' THEN (SELECT json_group_array(json_patch(json_object('name',json_extract(value,'$.name'),'bytes',${binarySize}),CASE WHEN json_extract(value,'$.directory') THEN json_object('directory',json('true')) ELSE '{}' END)) FROM json_each(${row},'$.payload.attachments')) END,
 'png',json(CASE WHEN length(json_extract(${row},'$.payload.png'))>0 THEN 'true' ELSE 'false' END),
 'html',json(CASE WHEN length(json_extract(${row},'$.payload.html'))>0 THEN 'true' ELSE 'false' END),
 'rtf',json(CASE WHEN length(json_extract(${row},'$.payload.rtf'))>0 THEN 'true' ELSE 'false' END),
 'formats',CASE WHEN json_type(${row},'$.payload.formats')='array' THEN (SELECT json_group_array(json_object('name',json_extract(value,'$.name'),'bytes',${binarySize})) FROM json_each(${row},'$.payload.formats')) END,
 'omittedFormats',json_extract(${row},'$.payload.omittedFormats')) FROM clipper_projection)`;
}
export function initializePreviewIndex(db:DatabaseConnection){
 const names=['clip_preview_insert','clip_preview_update','clip_preview_delete','snippet_list_insert','snippet_list_update','snippet_list_delete'];
 // Upgrade only our legacy trigger definitions; cached projections and primary records are unchanged.
 const installed=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name IN ('"+names.join("','")+"')").all() as {name:string;sql:string}[];
 const legacy=installed.some(row=>!row.name.endsWith('_delete')&&!row.sql.includes('clipper_projection(doc) AS MATERIALIZED'));
 const drop=legacy?names.map(name=>'DROP TRIGGER IF EXISTS '+name+';').join(''):'';
 const clip=payloadProjection('new.data'),snippet=payloadProjection('new.data',false);
 const summary=(row:string)=>`json_set(json_remove(${row},'$.payload'),'$.text',coalesce(json_extract(${row},'$.payload.text'),json_extract(${row},'$.text'),''))`;
 db.exec(`SAVEPOINT preview_index;
 ${drop}
 CREATE TABLE IF NOT EXISTS clip_preview_cache(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS snippet_list_cache(id TEXT PRIMARY KEY,data TEXT NOT NULL,payload TEXT NOT NULL,bytes INTEGER NOT NULL,revision INTEGER NOT NULL);
 CREATE TRIGGER IF NOT EXISTS clip_preview_insert AFTER INSERT ON clips BEGIN INSERT OR REPLACE INTO clip_preview_cache VALUES(new.id,${clip}); END;
 CREATE TRIGGER IF NOT EXISTS clip_preview_update AFTER UPDATE ON clips BEGIN DELETE FROM clip_preview_cache WHERE id=old.id AND old.id<>new.id;INSERT OR REPLACE INTO clip_preview_cache VALUES(new.id,${clip}); END;
 CREATE TRIGGER IF NOT EXISTS clip_preview_delete AFTER DELETE ON clips BEGIN DELETE FROM clip_preview_cache WHERE id=old.id;END;
 CREATE TRIGGER IF NOT EXISTS snippet_list_insert AFTER INSERT ON snippets BEGIN UPDATE snippet_list_cache SET data=${summary('new.data')},payload=${snippet},bytes=length(CAST(new.data AS BLOB)),revision=revision+1 WHERE id=new.id;INSERT INTO snippet_list_cache SELECT new.id,${summary('new.data')},${snippet},length(CAST(new.data AS BLOB)),1 WHERE NOT EXISTS(SELECT 1 FROM snippet_list_cache WHERE id=new.id); END;
 CREATE TRIGGER IF NOT EXISTS snippet_list_update AFTER UPDATE ON snippets BEGIN DELETE FROM snippet_list_cache WHERE id=old.id AND old.id<>new.id;UPDATE snippet_list_cache SET data=${summary('new.data')},payload=${snippet},bytes=length(CAST(new.data AS BLOB)),revision=revision+1 WHERE id=new.id;INSERT INTO snippet_list_cache SELECT new.id,${summary('new.data')},${snippet},length(CAST(new.data AS BLOB)),1 WHERE NOT EXISTS(SELECT 1 FROM snippet_list_cache WHERE id=new.id); END;
 CREATE TRIGGER IF NOT EXISTS snippet_list_delete AFTER DELETE ON snippets BEGIN DELETE FROM snippet_list_cache WHERE id=old.id;END;
 DELETE FROM clip_preview_cache WHERE id NOT IN(SELECT id FROM clips);
 INSERT INTO clip_preview_cache SELECT id,${payloadProjection('data')} FROM clips WHERE id NOT IN(SELECT id FROM clip_preview_cache);
 DELETE FROM snippet_list_cache WHERE id NOT IN(SELECT id FROM snippets);
 INSERT INTO snippet_list_cache SELECT id,${summary('data')},${payloadProjection('data',false)},length(CAST(data AS BLOB)),1 FROM snippets WHERE id NOT IN(SELECT id FROM snippet_list_cache);
 RELEASE preview_index;`);
}
