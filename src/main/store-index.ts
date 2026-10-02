import type {DatabaseConnection} from './database';
/** Rebuildable summaries. Primary rows, backup format and version remain unchanged. */
export function initializeListIndex(db:DatabaseConnection){
 db.exec(`SAVEPOINT list_index;
 CREATE TABLE IF NOT EXISTS clip_list_cache(id TEXT PRIMARY KEY,data TEXT NOT NULL,bytes INTEGER NOT NULL);
 CREATE TRIGGER IF NOT EXISTS clip_list_insert AFTER INSERT ON clips BEGIN
  INSERT OR REPLACE INTO clip_list_cache VALUES(new.id,json_remove(new.data,'$.payload'),length(CAST(new.data AS BLOB)));
 END;
 CREATE TRIGGER IF NOT EXISTS clip_list_update AFTER UPDATE ON clips BEGIN
  DELETE FROM clip_list_cache WHERE id=old.id AND old.id<>new.id;
  INSERT OR REPLACE INTO clip_list_cache VALUES(new.id,json_remove(new.data,'$.payload'),length(CAST(new.data AS BLOB)));
 END;
 CREATE TRIGGER IF NOT EXISTS clip_list_delete AFTER DELETE ON clips BEGIN
  DELETE FROM clip_list_cache WHERE id=old.id;
 END;
 DELETE FROM clip_list_cache WHERE id NOT IN (SELECT id FROM clips);
 INSERT INTO clip_list_cache SELECT id,json_remove(data,'$.payload'),length(CAST(data AS BLOB)) FROM clips WHERE id NOT IN (SELECT id FROM clip_list_cache);
 RELEASE list_index;`);
}
