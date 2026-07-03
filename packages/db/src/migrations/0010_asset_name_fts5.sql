-- Hand-authored: drizzle-kit cannot model FTS5 virtual tables or triggers, so this
-- migration is maintained by hand and kept in lockstep with packages/db/src/fts.ts.
-- All statements are idempotent (IF NOT EXISTS) so this composes safely with the
-- `bun db:fts` script and the server's boot-time self-provisioning.
CREATE VIRTUAL TABLE IF NOT EXISTS asset_fts USING fts5(asset_id UNINDEXED, name, tokenize='trigram');--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS asset_fts_ai AFTER INSERT ON asset BEGIN
  INSERT INTO asset_fts(asset_id, name) VALUES (new.id, new.name);
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS asset_fts_ad AFTER DELETE ON asset BEGIN
  DELETE FROM asset_fts WHERE asset_id = old.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS asset_fts_au AFTER UPDATE OF name ON asset BEGIN
  UPDATE asset_fts SET name = new.name WHERE asset_id = old.id;
END;--> statement-breakpoint
INSERT INTO asset_fts(asset_id, name)
  SELECT a.id, a.name FROM asset a
  WHERE NOT EXISTS (SELECT 1 FROM asset_fts f WHERE f.asset_id = a.id);
