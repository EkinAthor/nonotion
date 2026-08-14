PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_files` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`data` blob,
	`uploaded_by` text NOT NULL,
	`page_id` text,
	`storage_backend` text DEFAULT 'db' NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`detached_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_files`("id", "filename", "mime_type", "size", "data", "uploaded_by", "page_id", "storage_backend", "status", "detached_at", "created_at") SELECT "id", "filename", "mime_type", "size", "data", "uploaded_by", NULL, 'db', 'ready', NULL, "created_at" FROM `files`;--> statement-breakpoint
DROP TABLE `files`;--> statement-breakpoint
ALTER TABLE `__new_files` RENAME TO `files`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_files_page_id` ON `files` (`page_id`);