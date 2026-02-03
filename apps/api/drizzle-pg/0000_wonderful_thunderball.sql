CREATE TABLE "blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"page_id" text NOT NULL,
	"order" integer NOT NULL,
	"content" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'document' NOT NULL,
	"owner_id" text NOT NULL,
	"parent_id" text,
	"child_ids" text[] DEFAULT '{}' NOT NULL,
	"icon" text,
	"is_starred" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"database_schema" jsonb,
	"properties" jsonb
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"page_id" text NOT NULL,
	"user_id" text NOT NULL,
	"level" text NOT NULL,
	"granted_by" text NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "permissions_page_id_user_id_pk" PRIMARY KEY("page_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"avatar_url" text,
	"role" text DEFAULT 'user' NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"approved" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_blocks_page_id" ON "blocks" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "idx_blocks_page_order" ON "blocks" USING btree ("page_id","order");--> statement-breakpoint
CREATE INDEX "idx_pages_owner_id" ON "pages" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_pages_parent_id" ON "pages" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_pages_type" ON "pages" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_permissions_user_id" ON "permissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");