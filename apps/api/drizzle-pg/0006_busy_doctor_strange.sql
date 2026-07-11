CREATE TABLE "page_references" (
	"source_row_id" text NOT NULL,
	"property_id" text NOT NULL,
	"target_row_id" text NOT NULL,
	CONSTRAINT "page_references_source_row_id_property_id_target_row_id_pk" PRIMARY KEY("source_row_id","property_id","target_row_id")
);
--> statement-breakpoint
CREATE INDEX "idx_page_references_target" ON "page_references" USING btree ("target_row_id");--> statement-breakpoint
CREATE INDEX "idx_page_references_source" ON "page_references" USING btree ("source_row_id");