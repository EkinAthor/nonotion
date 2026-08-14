ALTER TABLE "files" ALTER COLUMN "data" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "page_id" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "storage_backend" text DEFAULT 'db' NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "status" text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "detached_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_files_page_id" ON "files" USING btree ("page_id");