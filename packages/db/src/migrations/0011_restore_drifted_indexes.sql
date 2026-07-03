-- Hand-authored: prod drifted from the migration record. `__drizzle_migrations`
-- says 0000-0007 applied, but the asset / asset_to_tag / vote / vote_entry /
-- vote_comment tables were at some point manually rebuilt in prod without their
-- indexes (verified 2026-07-01 against wanderer-primary-db: zero custom indexes
-- on those tables while category/game/saved_asset/tag kept theirs). Because the
-- objects are already recorded as applied, re-running old migrations can't heal
-- this -- so this migration re-asserts the schema's full index set for the
-- affected tables. Every statement is IF NOT EXISTS: a no-op on databases that
-- are already correct (dev/test/staging), pure restoration on prod.
-- vote_entry_user_unique is safe to restore: prod verified to have 0 duplicate
-- (entry_id, user_id) groups.
CREATE INDEX IF NOT EXISTS `asset_game_idx` ON `asset` (`game_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `asset_category_idx` ON `asset` (`category_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `asset_name_idx` ON `asset` (`name`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `asset_status_idx` ON `asset` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `asset_uploaded_by_idx` ON `asset` (`uploaded_by`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `asset_created_at_idx` ON `asset` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `asset_game_status_idx` ON `asset` (`game_id`,`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `asset_category_status_idx` ON `asset` (`category_id`,`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `asset_game_category_status_idx` ON `asset` (`game_id`,`category_id`,`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `asset_status_created_idx` ON `asset` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `asset_status_download_idx` ON `asset` (`status`,`download_count`,`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `asset_status_view_idx` ON `asset` (`status`,`view_count`,`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `asset_to_tag_asset_idx` ON `asset_to_tag` (`asset_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `asset_to_tag_tag_idx` ON `asset_to_tag` (`tag_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `vote_entry_user_unique` ON `vote` (`entry_id`,`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `vote_entry_id_idx` ON `vote` (`entry_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `vote_user_id_idx` ON `vote` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `vote_entry_type_idx` ON `vote_entry` (`type`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `vote_entry_status_idx` ON `vote_entry` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `vote_entry_created_by_idx` ON `vote_entry` (`created_by`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `vote_entry_created_at_idx` ON `vote_entry` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `vote_entry_vote_count_idx` ON `vote_entry` (`vote_count`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `vote_entry_status_vote_count_idx` ON `vote_entry` (`status`,`vote_count`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `vote_comment_entry_id_idx` ON `vote_comment` (`entry_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `vote_comment_user_id_idx` ON `vote_comment` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `vote_comment_created_at_idx` ON `vote_comment` (`created_at`);
