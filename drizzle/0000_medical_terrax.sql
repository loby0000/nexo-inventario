CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_email` ON `members` (`email`);--> statement-breakpoint
CREATE TABLE `movements` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product_id` text NOT NULL,
	`type` text NOT NULL,
	`quantity` integer NOT NULL,
	`note` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "movement_valid" CHECK("movements"."quantity" > 0 AND "movements"."type" IN ('in','out'))
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`sku` text NOT NULL,
	`category` text NOT NULL,
	`supplier` text DEFAULT '' NOT NULL,
	`unit` text DEFAULT 'unidad' NOT NULL,
	`cost` integer NOT NULL,
	`price` integer NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`minimum` integer DEFAULT 5 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "product_nonnegative" CHECK("products"."stock" >= 0 AND "products"."cost" >= 0 AND "products"."price" >= 0 AND "products"."minimum" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_owner_sku` ON `products` (`owner`,`sku`);--> statement-breakpoint
CREATE TRIGGER movement_validate BEFORE INSERT ON movements BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND owner=NEW.owner AND archived=0) THEN RAISE(ABORT,'invalid_product') END;
 SELECT CASE WHEN NEW.type='out' AND (SELECT stock FROM products WHERE id=NEW.product_id)<NEW.quantity THEN RAISE(ABORT,'insufficient_stock') END;
END;
--> statement-breakpoint
CREATE TRIGGER movement_apply AFTER INSERT ON movements BEGIN
 UPDATE products SET stock=stock+CASE WHEN NEW.type='in' THEN NEW.quantity ELSE -NEW.quantity END,updated_at=NEW.created_at WHERE id=NEW.product_id AND owner=NEW.owner;
END;
--> statement-breakpoint
CREATE INDEX movement_owner_date ON movements(owner,created_at);
