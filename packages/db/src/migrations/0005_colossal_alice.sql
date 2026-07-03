CREATE TABLE `comment_upvote` (
	`id` text PRIMARY KEY NOT NULL,
	`comment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`comment_id`) REFERENCES `vote_comment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `comment_upvote_comment_user_unique` ON `comment_upvote` (`comment_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `comment_upvote_comment_id_idx` ON `comment_upvote` (`comment_id`);--> statement-breakpoint
CREATE INDEX `comment_upvote_user_id_idx` ON `comment_upvote` (`user_id`);--> statement-breakpoint
ALTER TABLE `vote_comment` ADD `upvote_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `vote_comment_upvote_count_idx` ON `vote_comment` (`upvote_count`);