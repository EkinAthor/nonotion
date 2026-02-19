CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`page_id` text NOT NULL,
	`order` integer NOT NULL,
	`content` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_blocks_page_id` ON `blocks` (`page_id`);--> statement-breakpoint
CREATE INDEX `idx_blocks_page_order` ON `blocks` (`page_id`,`order`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`type` text DEFAULT 'document' NOT NULL,
	`owner_id` text NOT NULL,
	`parent_id` text,
	`child_ids` text DEFAULT '[]' NOT NULL,
	`icon` text,
	`is_starred` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`database_schema` text,
	`properties` text
);
--> statement-breakpoint
CREATE INDEX `idx_pages_owner_id` ON `pages` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_pages_parent_id` ON `pages` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_pages_type` ON `pages` (`type`);