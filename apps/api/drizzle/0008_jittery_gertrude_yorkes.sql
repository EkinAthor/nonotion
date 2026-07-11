CREATE TABLE `page_references` (
	`source_row_id` text NOT NULL,
	`property_id` text NOT NULL,
	`target_row_id` text NOT NULL,
	PRIMARY KEY(`source_row_id`, `property_id`, `target_row_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_page_references_target` ON `page_references` (`target_row_id`);--> statement-breakpoint
CREATE INDEX `idx_page_references_source` ON `page_references` (`source_row_id`);