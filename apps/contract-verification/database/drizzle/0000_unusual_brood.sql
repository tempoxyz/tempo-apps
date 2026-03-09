CREATE TABLE `code` (
	`code_hash` blob PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_by` text DEFAULT 'verification-api' NOT NULL,
	`updated_by` text DEFAULT 'verification-api' NOT NULL,
	`code_hash_keccak` blob NOT NULL,
	`code` blob
);
--> statement-breakpoint
CREATE INDEX `code_code_hash_keccak` ON `code` (`code_hash_keccak`);--> statement-breakpoint
CREATE TABLE `compiled_contracts_signatures` (
	`id` text PRIMARY KEY NOT NULL,
	`compilation_id` text NOT NULL,
	`signature_hash_32` blob NOT NULL,
	`signature_type` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`compilation_id`) REFERENCES `compiled_contracts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`signature_hash_32`) REFERENCES `signatures`(`signature_hash_32`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `compiled_contracts_signatures_signature_idx` ON `compiled_contracts_signatures` (`signature_hash_32`);--> statement-breakpoint
CREATE INDEX `compiled_contracts_signatures_type_signature_idx` ON `compiled_contracts_signatures` (`signature_type`,`signature_hash_32`);--> statement-breakpoint
CREATE UNIQUE INDEX `compiled_contracts_signatures_pseudo_pkey` ON `compiled_contracts_signatures` (`compilation_id`,`signature_hash_32`,`signature_type`);--> statement-breakpoint
CREATE TABLE `compiled_contracts_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`compilation_id` text NOT NULL,
	`source_hash` blob NOT NULL,
	`path` text NOT NULL,
	FOREIGN KEY (`compilation_id`) REFERENCES `compiled_contracts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_hash`) REFERENCES `sources`(`source_hash`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `compiled_contracts_sources_compilation_id` ON `compiled_contracts_sources` (`compilation_id`);--> statement-breakpoint
CREATE INDEX `compiled_contracts_sources_source_hash` ON `compiled_contracts_sources` (`source_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `compiled_contracts_sources_pseudo_pkey` ON `compiled_contracts_sources` (`compilation_id`,`path`);--> statement-breakpoint
CREATE TABLE `compiled_contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_by` text DEFAULT 'verification-api' NOT NULL,
	`updated_by` text DEFAULT 'verification-api' NOT NULL,
	`compiler` text NOT NULL,
	`version` text NOT NULL,
	`language` text NOT NULL,
	`name` text NOT NULL,
	`fully_qualified_name` text NOT NULL,
	`compiler_settings` text NOT NULL,
	`compilation_artifacts` text NOT NULL,
	`creation_code_hash` blob NOT NULL,
	`creation_code_artifacts` text NOT NULL,
	`runtime_code_hash` blob NOT NULL,
	`runtime_code_artifacts` text NOT NULL,
	FOREIGN KEY (`creation_code_hash`) REFERENCES `code`(`code_hash`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`runtime_code_hash`) REFERENCES `code`(`code_hash`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `compiled_contracts_creation_code_hash` ON `compiled_contracts` (`creation_code_hash`);--> statement-breakpoint
CREATE INDEX `compiled_contracts_runtime_code_hash` ON `compiled_contracts` (`runtime_code_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `compiled_contracts_pseudo_pkey` ON `compiled_contracts` (`compiler`,`version`,`language`,`creation_code_hash`,`runtime_code_hash`);--> statement-breakpoint
CREATE TABLE `contract_deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_by` text DEFAULT 'verification-api' NOT NULL,
	`updated_by` text DEFAULT 'verification-api' NOT NULL,
	`chain_id` integer NOT NULL,
	`address` blob NOT NULL,
	`transaction_hash` blob,
	`block_number` integer,
	`transaction_index` integer,
	`deployer` blob,
	`contract_id` text NOT NULL,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `contract_deployments_address` ON `contract_deployments` (`address`);--> statement-breakpoint
CREATE INDEX `contract_deployments_contract_id` ON `contract_deployments` (`contract_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `contract_deployments_pseudo_pkey` ON `contract_deployments` (`chain_id`,`address`,`transaction_hash`,`contract_id`);--> statement-breakpoint
CREATE TABLE `contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_by` text DEFAULT 'verification-api' NOT NULL,
	`updated_by` text DEFAULT 'verification-api' NOT NULL,
	`creation_code_hash` blob,
	`runtime_code_hash` blob NOT NULL,
	FOREIGN KEY (`creation_code_hash`) REFERENCES `code`(`code_hash`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`runtime_code_hash`) REFERENCES `code`(`code_hash`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `contracts_creation_code_hash` ON `contracts` (`creation_code_hash`);--> statement-breakpoint
CREATE INDEX `contracts_runtime_code_hash` ON `contracts` (`runtime_code_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `contracts_pseudo_pkey` ON `contracts` (`creation_code_hash`,`runtime_code_hash`);--> statement-breakpoint
CREATE TABLE `signatures` (
	`signature_hash_32` blob PRIMARY KEY NOT NULL,
	`signature` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `signatures_signature_idx` ON `signatures` (`signature`);--> statement-breakpoint
CREATE TABLE `sources` (
	`source_hash` blob PRIMARY KEY NOT NULL,
	`source_hash_keccak` blob NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_by` text DEFAULT 'verification-api' NOT NULL,
	`updated_by` text DEFAULT 'verification-api' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification_jobs_ephemeral` (
	`id` text PRIMARY KEY NOT NULL,
	`recompiled_creation_code` blob,
	`recompiled_runtime_code` blob,
	`onchain_creation_code` blob,
	`onchain_runtime_code` blob,
	`creation_transaction_hash` blob,
	FOREIGN KEY (`id`) REFERENCES `verification_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `verification_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	`chain_id` integer NOT NULL,
	`contract_address` blob NOT NULL,
	`verified_contract_id` integer,
	`error_code` text,
	`error_id` text,
	`error_data` text,
	`verification_endpoint` text NOT NULL,
	`hardware` text,
	`compilation_time` integer,
	`external_verification` text,
	FOREIGN KEY (`verified_contract_id`) REFERENCES `verified_contracts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `verification_jobs_chain_id_address_idx` ON `verification_jobs` (`chain_id`,`contract_address`);--> statement-breakpoint
CREATE TABLE `verified_contracts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_by` text DEFAULT 'verification-api' NOT NULL,
	`updated_by` text DEFAULT 'verification-api' NOT NULL,
	`deployment_id` text NOT NULL,
	`compilation_id` text NOT NULL,
	`creation_match` integer NOT NULL,
	`creation_values` text,
	`creation_transformations` text,
	`creation_metadata_match` integer,
	`runtime_match` integer NOT NULL,
	`runtime_values` text,
	`runtime_transformations` text,
	`runtime_metadata_match` integer,
	FOREIGN KEY (`deployment_id`) REFERENCES `contract_deployments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`compilation_id`) REFERENCES `compiled_contracts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `verified_contracts_deployment_id` ON `verified_contracts` (`deployment_id`);--> statement-breakpoint
CREATE INDEX `verified_contracts_compilation_id` ON `verified_contracts` (`compilation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `verified_contracts_pseudo_pkey` ON `verified_contracts` (`compilation_id`,`deployment_id`);
