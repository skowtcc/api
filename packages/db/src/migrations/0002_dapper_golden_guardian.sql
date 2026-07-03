DROP INDEX IF EXISTS `user_username_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_name_unique` ON `user` (`name`);