CREATE TABLE `gmail_handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`draft_id` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot_id` text NOT NULL,
	`account` text NOT NULL,
	`gmail_draft_id` text,
	`thread_id` text,
	`message_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `email_drafts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gmail_handoffs_owner_account_idx` ON `gmail_handoffs` (`owner_id`,`account`);--> statement-breakpoint
CREATE UNIQUE INDEX `gmail_handoffs_snapshot_idx` ON `gmail_handoffs` (`snapshot_id`);--> statement-breakpoint
ALTER TABLE `email_drafts` ADD `state` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `email_drafts` ADD `sent_at` text;