ALTER TABLE `users` ADD `is_owner` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `users` SET `is_owner` = 1 WHERE `id` = (
  SELECT `id` FROM `users` WHERE `role` = 'admin' ORDER BY `created_at` ASC LIMIT 1
);