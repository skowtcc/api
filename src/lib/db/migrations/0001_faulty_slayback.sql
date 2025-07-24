CREATE TABLE `game_to_category` (
	`game_id` text NOT NULL,
	`category_id` text NOT NULL,
	PRIMARY KEY(`game_id`, `category_id`),
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE cascade
);
