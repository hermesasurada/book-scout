PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_books` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`isbn13` text NOT NULL,
	`title` text NOT NULL,
	`author` text DEFAULT '' NOT NULL,
	`publisher` text DEFAULT '' NOT NULL,
	`cover` text DEFAULT '' NOT NULL,
	`aladin_link` text DEFAULT '' NOT NULL,
	`aladin_item_id` text DEFAULT '' NOT NULL,
	`pub_date` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`price_sales` integer,
	`sales_point` integer,
	`review_rank` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_books`("id", "isbn13", "title", "author", "publisher", "cover", "aladin_link", "aladin_item_id", "pub_date", "category", "price_sales", "sales_point", "review_rank", "created_at") SELECT "id", "isbn13", "title", "author", "publisher", "cover", "aladin_link", "aladin_item_id", "pub_date", "category", "price_sales", "sales_point", "review_rank", "created_at" FROM `books`;--> statement-breakpoint
DROP TABLE `books`;--> statement-breakpoint
ALTER TABLE `__new_books` RENAME TO `books`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `books_isbn13_unique` ON `books` (`isbn13`);