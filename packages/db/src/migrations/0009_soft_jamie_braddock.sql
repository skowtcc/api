CREATE INDEX `asset_status_download_idx` ON `asset` (`status`,`download_count`,`id`);--> statement-breakpoint
CREATE INDEX `asset_status_view_idx` ON `asset` (`status`,`view_count`,`id`);