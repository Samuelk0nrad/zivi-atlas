CREATE TABLE `application_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`source_account` text NOT NULL,
	`message_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`direction` text NOT NULL,
	`occurred_at` text NOT NULL,
	`sender` text NOT NULL,
	`recipients` text NOT NULL,
	`cc` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`body_truncated` integer NOT NULL,
	`imported_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `application_emails_owner_message_idx` ON `application_emails` (`owner_id`,`source_account`,`message_id`);--> statement-breakpoint
CREATE INDEX `application_emails_timeline_idx` ON `application_emails` (`application_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`org_code` integer NOT NULL,
	`org_title` text NOT NULL,
	`contact_email` text NOT NULL,
	`status` text DEFAULT 'automatic' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_import_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `applications_owner_org_idx` ON `applications` (`owner_id`,`org_code`);
--> statement-breakpoint
CREATE TRIGGER application_email_assignment_guard BEFORE INSERT ON application_emails
WHEN EXISTS (SELECT 1 FROM application_emails WHERE owner_id=NEW.owner_id AND source_account=NEW.source_account AND message_id=NEW.message_id AND application_id!=NEW.application_id)
BEGIN SELECT RAISE(ABORT, 'email_application_conflict'); END;
