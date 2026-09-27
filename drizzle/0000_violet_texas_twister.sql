CREATE TABLE `collection_items` (
	`collection_id` text NOT NULL,
	`org_code` integer NOT NULL,
	`title` text NOT NULL,
	`branch` text NOT NULL,
	`city` text NOT NULL,
	`added_at` text NOT NULL,
	PRIMARY KEY(`collection_id`, `org_code`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `collections_owner_idx` ON `collections` (`owner_id`);