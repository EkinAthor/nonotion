ALTER TABLE `users` ADD `two_factor_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `two_factor_code_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `two_factor_code_expires_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `two_factor_code_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `two_factor_code_purpose` text;