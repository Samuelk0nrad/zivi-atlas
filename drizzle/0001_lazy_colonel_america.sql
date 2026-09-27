CREATE TABLE `label_items` (
	`label_id` text NOT NULL,
	`org_code` integer NOT NULL,
	`added_at` text NOT NULL,
	PRIMARY KEY(`label_id`, `org_code`),
	FOREIGN KEY (`label_id`) REFERENCES `labels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `labels` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`color` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `labels_owner_name_idx` ON `labels` (`owner_id`,`name_key`);