CREATE TABLE `native_contract_revision_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`revision_id` text NOT NULL,
	`source_hash` blob NOT NULL,
	`path` text NOT NULL,
	`is_entrypoint` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`revision_id`) REFERENCES `native_contract_revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_hash`) REFERENCES `sources`(`source_hash`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `native_contract_revision_sources_revision_id` ON `native_contract_revision_sources` (`revision_id`);--> statement-breakpoint
CREATE INDEX `native_contract_revision_sources_source_hash` ON `native_contract_revision_sources` (`source_hash`);--> statement-breakpoint
CREATE INDEX `native_contract_revision_sources_revision_entrypoint` ON `native_contract_revision_sources` (`revision_id`,`is_entrypoint`);--> statement-breakpoint
CREATE UNIQUE INDEX `native_contract_revision_sources_revision_path` ON `native_contract_revision_sources` (`revision_id`,`path`);--> statement-breakpoint
CREATE TABLE `native_contract_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_by` text DEFAULT 'verification-api' NOT NULL,
	`updated_by` text DEFAULT 'verification-api' NOT NULL,
	`native_contract_id` text NOT NULL,
	`repo` text NOT NULL,
	`commit_sha` text NOT NULL,
	`commit_url` text,
	`protocol_version` text,
	`from_block` integer NOT NULL,
	`to_block` integer,
	`source_root` text,
	`snapshot_status` text NOT NULL,
	FOREIGN KEY (`native_contract_id`) REFERENCES `native_contracts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `native_contract_revisions_native_contract_id` ON `native_contract_revisions` (`native_contract_id`);--> statement-breakpoint
CREATE INDEX `native_contract_revisions_active_range` ON `native_contract_revisions` (`native_contract_id`,`from_block`,`to_block`);--> statement-breakpoint
CREATE UNIQUE INDEX `native_contract_revisions_contract_from_block` ON `native_contract_revisions` (`native_contract_id`,`from_block`);--> statement-breakpoint
CREATE TABLE `native_contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_by` text DEFAULT 'verification-api' NOT NULL,
	`updated_by` text DEFAULT 'verification-api' NOT NULL,
	`chain_id` integer NOT NULL,
	`address` blob NOT NULL,
	`name` text NOT NULL,
	`runtime_type` text NOT NULL,
	`language` text NOT NULL,
	`abi_json` text NOT NULL,
	`docs_url` text
);
--> statement-breakpoint
CREATE INDEX `native_contracts_address` ON `native_contracts` (`address`);--> statement-breakpoint
CREATE UNIQUE INDEX `native_contracts_chain_id_address` ON `native_contracts` (`chain_id`,`address`);
