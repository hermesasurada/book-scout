CREATE TABLE `books` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`isbn13` text NOT NULL,
	`title` text NOT NULL,
	`author` text DEFAULT '' NOT NULL,
	`publisher` text DEFAULT '' NOT NULL,
	`cover` text DEFAULT '' NOT NULL,
	`aladin_link` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `books_isbn13_unique` ON `books` (`isbn13`);--> statement-breakpoint
CREATE TABLE `checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`book_id` integer NOT NULL,
	`checked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`aladin_status` text NOT NULL,
	`aladin_store` text DEFAULT '' NOT NULL,
	`aladin_price` integer,
	`aladin_link` text DEFAULT '' NOT NULL,
	`library_status` text NOT NULL,
	`library_due_date` text DEFAULT '' NOT NULL,
	`library_location` text DEFAULT '' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checks_book_date_idx` ON `checks` (`book_id`,`checked_at`);