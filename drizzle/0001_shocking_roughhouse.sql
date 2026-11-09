CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`type` text NOT NULL,
	`reference` text NOT NULL,
	`contact` text NOT NULL,
	`note` text NOT NULL,
	`actor` text NOT NULL,
	`total` integer NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "document_valid" CHECK("documents"."type" IN ('purchase','sale') AND "documents"."total" >= 0)
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`owner` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
DROP INDEX `member_email`;--> statement-breakpoint
ALTER TABLE `members` ADD `user_id` text;--> statement-breakpoint
ALTER TABLE `members` ADD `accepted` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `member_owner_email` ON `members` (`owner`,`email`);--> statement-breakpoint
ALTER TABLE `movements` ADD `document_id` text;--> statement-breakpoint
ALTER TABLE `movements` ADD `unit_price` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `barcode` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `product_owner_barcode` ON `products` (`owner`,`barcode`) WHERE "products"."barcode" <> '';--> statement-breakpoint
CREATE TRIGGER movement_document_validate BEFORE INSERT ON movements WHEN NEW.document_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM documents WHERE id=NEW.document_id AND owner=NEW.owner AND type=CASE WHEN NEW.type='in' THEN 'purchase' ELSE 'sale' END) THEN RAISE(ABORT,'invalid_document') END;
 SELECT CASE WHEN NEW.unit_price IS NULL OR NEW.unit_price<0 THEN RAISE(ABORT,'invalid_price') END;
END;
