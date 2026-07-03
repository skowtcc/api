CREATE TABLE `vote` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `vote_entry`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vote_entry_user_unique` ON `vote` (`entry_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `vote_entry_id_idx` ON `vote` (`entry_id`);--> statement-breakpoint
CREATE INDEX `vote_user_id_idx` ON `vote` (`user_id`);--> statement-breakpoint
CREATE TABLE `vote_comment` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `vote_entry`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vote_comment_entry_id_idx` ON `vote_comment` (`entry_id`);--> statement-breakpoint
CREATE INDEX `vote_comment_user_id_idx` ON `vote_comment` (`user_id`);--> statement-breakpoint
CREATE INDEX `vote_comment_created_at_idx` ON `vote_comment` (`created_at`);--> statement-breakpoint
CREATE TABLE `vote_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'open' NOT NULL,
	`game_id` text,
	`created_by` text NOT NULL,
	`vote_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vote_entry_type_idx` ON `vote_entry` (`type`);--> statement-breakpoint
CREATE INDEX `vote_entry_status_idx` ON `vote_entry` (`status`);--> statement-breakpoint
CREATE INDEX `vote_entry_created_by_idx` ON `vote_entry` (`created_by`);--> statement-breakpoint
CREATE INDEX `vote_entry_vote_count_idx` ON `vote_entry` (`vote_count`);--> statement-breakpoint
CREATE INDEX `vote_entry_created_at_idx` ON `vote_entry` (`created_at`);--> statement-breakpoint
CREATE INDEX `vote_entry_status_vote_count_idx` ON `vote_entry` (`status`,`vote_count`);--> statement-breakpoint
DROP TABLE `asset_link`;--> statement-breakpoint
DROP TABLE `download_history`;--> statement-breakpoint
DROP TABLE `download_history_to_asset`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_asset` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`game_id` text NOT NULL,
	`category_id` text NOT NULL,
	`uploaded_by` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`hash` text NOT NULL,
	`size` integer NOT NULL,
	`extension` text NOT NULL,
	`download_count` integer DEFAULT 0 NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`is_suggestive` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_asset`("id", "name", "game_id", "category_id", "uploaded_by", "status", "hash", "size", "extension", "download_count", "view_count", "is_suggestive", "created_at") SELECT "id", "name", "game_id", "category_id", "uploaded_by", "status", "hash", "size", "extension", "download_count", "view_count", "is_suggestive", "created_at" FROM `asset`;--> statement-breakpoint
DROP TABLE `asset`;--> statement-breakpoint
ALTER TABLE `__new_asset` RENAME TO `asset`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `asset_game_idx` ON `asset` (`game_id`);--> statement-breakpoint
CREATE INDEX `asset_category_idx` ON `asset` (`category_id`);--> statement-breakpoint
CREATE INDEX `asset_name_idx` ON `asset` (`name`);--> statement-breakpoint
CREATE INDEX `asset_status_idx` ON `asset` (`status`);--> statement-breakpoint
CREATE INDEX `asset_uploaded_by_idx` ON `asset` (`uploaded_by`);--> statement-breakpoint
CREATE INDEX `asset_created_at_idx` ON `asset` (`created_at`);--> statement-breakpoint
CREATE INDEX `asset_game_status_idx` ON `asset` (`game_id`,`status`);--> statement-breakpoint
CREATE INDEX `asset_category_status_idx` ON `asset` (`category_id`,`status`);--> statement-breakpoint
CREATE INDEX `asset_game_category_status_idx` ON `asset` (`game_id`,`category_id`,`status`);--> statement-breakpoint
CREATE INDEX `asset_status_created_idx` ON `asset` (`status`,`created_at`);--> statement-breakpoint
DROP INDEX IF EXISTS "asset_game_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "asset_category_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "asset_name_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "asset_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "asset_uploaded_by_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "asset_created_at_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "asset_game_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "asset_category_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "asset_game_category_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "asset_status_created_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "asset_to_tag_asset_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "asset_to_tag_tag_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "category_slug_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "category_slug_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "category_name_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "game_slug_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "game_slug_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "game_name_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "game_to_category_game_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "game_to_category_category_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "saved_asset_user_asset_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "saved_asset_user_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "saved_asset_asset_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "saved_asset_created_at_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "session_token_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "tag_slug_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "tag_slug_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "tag_name_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "user_name_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "user_email_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "vote_entry_user_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "vote_entry_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "vote_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "vote_comment_entry_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "vote_comment_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "vote_comment_created_at_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "vote_entry_type_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "vote_entry_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "vote_entry_created_by_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "vote_entry_vote_count_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "vote_entry_created_at_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "vote_entry_status_vote_count_idx";--> statement-breakpoint
ALTER TABLE `user` ALTER COLUMN "email_verified" TO "email_verified" integer NOT NULL;--> statement-breakpoint
CREATE INDEX `asset_to_tag_asset_idx` ON `asset_to_tag` (`asset_id`);--> statement-breakpoint
CREATE INDEX `asset_to_tag_tag_idx` ON `asset_to_tag` (`tag_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `category_slug_unique` ON `category` (`slug`);--> statement-breakpoint
CREATE INDEX `category_slug_idx` ON `category` (`slug`);--> statement-breakpoint
CREATE INDEX `category_name_idx` ON `category` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `game_slug_unique` ON `game` (`slug`);--> statement-breakpoint
CREATE INDEX `game_slug_idx` ON `game` (`slug`);--> statement-breakpoint
CREATE INDEX `game_name_idx` ON `game` (`name`);--> statement-breakpoint
CREATE INDEX `game_to_category_game_idx` ON `game_to_category` (`game_id`);--> statement-breakpoint
CREATE INDEX `game_to_category_category_idx` ON `game_to_category` (`category_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `saved_asset_user_asset_idx` ON `saved_asset` (`user_id`,`asset_id`);--> statement-breakpoint
CREATE INDEX `saved_asset_user_idx` ON `saved_asset` (`user_id`);--> statement-breakpoint
CREATE INDEX `saved_asset_asset_idx` ON `saved_asset` (`asset_id`);--> statement-breakpoint
CREATE INDEX `saved_asset_created_at_idx` ON `saved_asset` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `tag_slug_unique` ON `tag` (`slug`);--> statement-breakpoint
CREATE INDEX `tag_slug_idx` ON `tag` (`slug`);--> statement-breakpoint
CREATE INDEX `tag_name_idx` ON `tag` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_name_unique` ON `user` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
ALTER TABLE `verification` ALTER COLUMN "created_at" TO "created_at" integer;--> statement-breakpoint
ALTER TABLE `verification` ALTER COLUMN "updated_at" TO "updated_at" integer;--> statement-breakpoint
CREATE TABLE `__new_asset_to_tag` (
	`asset_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`asset_id`, `tag_id`),
	FOREIGN KEY (`asset_id`) REFERENCES `asset`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_asset_to_tag`("asset_id", "tag_id") SELECT "asset_id", "tag_id" FROM `asset_to_tag`;--> statement-breakpoint
DROP TABLE `asset_to_tag`;--> statement-breakpoint
ALTER TABLE `__new_asset_to_tag` RENAME TO `asset_to_tag`;--> statement-breakpoint
ALTER TABLE `tag` DROP COLUMN `color`;