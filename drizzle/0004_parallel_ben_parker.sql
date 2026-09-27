CREATE TABLE `draft_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text,
	`owner_id` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `email_drafts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `draft_attachments_owner_idx` ON `draft_attachments` (`owner_id`,`draft_id`);