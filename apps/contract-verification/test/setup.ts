import { env } from 'cloudflare:test'

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS code (
    code_hash blob PRIMARY KEY NOT NULL,
    created_at text DEFAULT (datetime('now')) NOT NULL,
    updated_at text DEFAULT (datetime('now')) NOT NULL,
    created_by text NOT NULL,
    updated_by text NOT NULL,
    code_hash_keccak blob NOT NULL,
    code blob
);

CREATE INDEX IF NOT EXISTS code_code_hash_keccak ON code(code_hash_keccak);

CREATE TABLE IF NOT EXISTS sources (
    source_hash blob PRIMARY KEY NOT NULL,
    source_hash_keccak blob NOT NULL,
    content text NOT NULL,
    created_at text DEFAULT (datetime('now')) NOT NULL,
    updated_at text DEFAULT (datetime('now')) NOT NULL,
    created_by text NOT NULL,
    updated_by text NOT NULL
);

CREATE TABLE IF NOT EXISTS contracts (
    id text PRIMARY KEY NOT NULL,
    created_at text DEFAULT (datetime('now')) NOT NULL,
    updated_at text DEFAULT (datetime('now')) NOT NULL,
    created_by text NOT NULL,
    updated_by text NOT NULL,
    creation_code_hash blob REFERENCES code(code_hash),
    runtime_code_hash blob NOT NULL REFERENCES code(code_hash)
);

CREATE INDEX IF NOT EXISTS contracts_creation_code_hash ON contracts(creation_code_hash);
CREATE INDEX IF NOT EXISTS contracts_runtime_code_hash ON contracts(runtime_code_hash);
CREATE UNIQUE INDEX IF NOT EXISTS contracts_pseudo_pkey ON contracts(creation_code_hash, runtime_code_hash);

CREATE TABLE IF NOT EXISTS contract_deployments (
    id text PRIMARY KEY NOT NULL,
    created_at text DEFAULT (datetime('now')) NOT NULL,
    updated_at text DEFAULT (datetime('now')) NOT NULL,
    created_by text NOT NULL,
    updated_by text NOT NULL,
    chain_id integer NOT NULL,
    address blob NOT NULL,
    transaction_hash blob,
    block_number integer,
    transaction_index integer,
    deployer blob,
    contract_id text NOT NULL REFERENCES contracts(id)
);

CREATE INDEX IF NOT EXISTS contract_deployments_address ON contract_deployments(address);
CREATE INDEX IF NOT EXISTS contract_deployments_contract_id ON contract_deployments(contract_id);
CREATE UNIQUE INDEX IF NOT EXISTS contract_deployments_pseudo_pkey ON contract_deployments(chain_id, address, transaction_hash, contract_id);

CREATE TABLE IF NOT EXISTS compiled_contracts (
    id text PRIMARY KEY NOT NULL,
    created_at text DEFAULT (datetime('now')) NOT NULL,
    updated_at text DEFAULT (datetime('now')) NOT NULL,
    created_by text NOT NULL,
    updated_by text NOT NULL,
    compiler text NOT NULL,
    version text NOT NULL,
    language text NOT NULL,
    name text NOT NULL,
    fully_qualified_name text NOT NULL,
    compiler_settings text NOT NULL,
    compilation_artifacts text NOT NULL,
    creation_code_hash blob NOT NULL REFERENCES code(code_hash),
    creation_code_artifacts text NOT NULL,
    runtime_code_hash blob NOT NULL REFERENCES code(code_hash),
    runtime_code_artifacts text NOT NULL
);

CREATE INDEX IF NOT EXISTS compiled_contracts_creation_code_hash ON compiled_contracts(creation_code_hash);
CREATE INDEX IF NOT EXISTS compiled_contracts_runtime_code_hash ON compiled_contracts(runtime_code_hash);
CREATE UNIQUE INDEX IF NOT EXISTS compiled_contracts_pseudo_pkey ON compiled_contracts(compiler, version, language, creation_code_hash, runtime_code_hash);

CREATE TABLE IF NOT EXISTS compiled_contracts_sources (
    id text PRIMARY KEY NOT NULL,
    compilation_id text NOT NULL REFERENCES compiled_contracts(id),
    source_hash blob NOT NULL REFERENCES sources(source_hash),
    path text NOT NULL
);

CREATE INDEX IF NOT EXISTS compiled_contracts_sources_compilation_id ON compiled_contracts_sources(compilation_id);
CREATE INDEX IF NOT EXISTS compiled_contracts_sources_source_hash ON compiled_contracts_sources(source_hash);
CREATE UNIQUE INDEX IF NOT EXISTS compiled_contracts_sources_pseudo_pkey ON compiled_contracts_sources(compilation_id, path);

CREATE TABLE IF NOT EXISTS signatures (
    signature_hash_32 blob PRIMARY KEY NOT NULL,
    signature text NOT NULL,
    created_at text DEFAULT (datetime('now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS signatures_signature_idx ON signatures(signature);

CREATE TABLE IF NOT EXISTS compiled_contracts_signatures (
    id text PRIMARY KEY NOT NULL,
    compilation_id text NOT NULL REFERENCES compiled_contracts(id),
    signature_hash_32 blob NOT NULL REFERENCES signatures(signature_hash_32),
    signature_type text NOT NULL,
    created_at text DEFAULT (datetime('now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS compiled_contracts_signatures_signature_idx ON compiled_contracts_signatures(signature_hash_32);
CREATE INDEX IF NOT EXISTS compiled_contracts_signatures_type_signature_idx ON compiled_contracts_signatures(signature_type, signature_hash_32);
CREATE UNIQUE INDEX IF NOT EXISTS compiled_contracts_signatures_pseudo_pkey ON compiled_contracts_signatures(compilation_id, signature_hash_32, signature_type);

CREATE TABLE IF NOT EXISTS verified_contracts (
    id integer PRIMARY KEY AUTOINCREMENT,
    created_at text DEFAULT (datetime('now')) NOT NULL,
    updated_at text DEFAULT (datetime('now')) NOT NULL,
    created_by text NOT NULL,
    updated_by text NOT NULL,
    deployment_id text NOT NULL REFERENCES contract_deployments(id),
    compilation_id text NOT NULL REFERENCES compiled_contracts(id),
    creation_match integer NOT NULL,
    creation_values text,
    creation_transformations text,
    creation_metadata_match integer,
    runtime_match integer NOT NULL,
    runtime_values text,
    runtime_transformations text,
    runtime_metadata_match integer
);

CREATE INDEX IF NOT EXISTS verified_contracts_deployment_id ON verified_contracts(deployment_id);
CREATE INDEX IF NOT EXISTS verified_contracts_compilation_id ON verified_contracts(compilation_id);
CREATE UNIQUE INDEX IF NOT EXISTS verified_contracts_pseudo_pkey ON verified_contracts(compilation_id, deployment_id);

CREATE TABLE IF NOT EXISTS verification_jobs (
    id text PRIMARY KEY NOT NULL,
    started_at text DEFAULT (datetime('now')) NOT NULL,
    completed_at text,
    chain_id integer NOT NULL,
    contract_address blob NOT NULL,
    verified_contract_id integer REFERENCES verified_contracts(id),
    error_code text,
    error_id text,
    error_data text,
    verification_endpoint text NOT NULL,
    hardware text,
    compilation_time integer,
    external_verification text
);

CREATE INDEX IF NOT EXISTS verification_jobs_chain_id_address_idx ON verification_jobs(chain_id, contract_address);

CREATE TABLE IF NOT EXISTS verification_jobs_ephemeral (
    id text PRIMARY KEY NOT NULL REFERENCES verification_jobs(id),
    recompiled_creation_code blob,
    recompiled_runtime_code blob,
    onchain_creation_code blob,
    onchain_runtime_code blob,
    creation_transaction_hash blob
);
`

// Setup runs before all tests - use batch to create all tables
const statements = SCHEMA_SQL.split(';')
	.map((s) => s.trim())
	.filter((s) => s.length > 0)
	.map((s) => env.CONTRACTS_DB.prepare(s))

await env.CONTRACTS_DB.batch(statements)
