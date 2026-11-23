/**
 * Compiler settings for Solidity standard JSON input (solc and solar), built from an allowlist.
 *
 * Verification compiles only to compare bytecode and store the contract's artifacts, so only
 * settings that change bytecode or metadata are forwarded. Everything else is dropped, including
 * `modelChecker`, `stopAfter` and `experimental`, and `outputSelection` is limited to the outputs a
 * verification job stores.
 *
 * Shared by the Worker (before a job is stored and before it compiles) and the container (before
 * it runs the compiler). Keep it free of runtime-specific imports.
 */

/** Top-level `settings` keys forwarded to the compiler as given. */
const FORWARDED_SETTINGS = [
	'remappings',
	'optimizer',
	'evmVersion',
	'eofVersion',
	'viaIR',
	'metadata',
	'libraries',
] as const

/** `settings.debug` keys forwarded to the compiler. */
const FORWARDED_DEBUG_SETTINGS = ['revertStrings', 'debugInfo'] as const

/** Per-contract outputs a verification job reads. */
export const VERIFICATION_OUTPUTS = [
	'abi',
	'metadata',
	'storageLayout',
	'userdoc',
	'devdoc',
	'evm.bytecode.object',
	'evm.bytecode.sourceMap',
	'evm.bytecode.linkReferences',
	'evm.deployedBytecode.object',
	'evm.deployedBytecode.sourceMap',
	'evm.deployedBytecode.linkReferences',
	'evm.deployedBytecode.immutableReferences',
] as const

type VerificationOutput = (typeof VERIFICATION_OUTPUTS)[number]

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBlockedObjectKey(key: string): boolean {
	return key === '__proto__' || key === 'constructor' || key === 'prototype'
}

/** Copies JSON data without prototype keys. */
export function sanitizeJsonValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sanitizeJsonValue)

	if (isPlainObject(value)) {
		const sanitized: Record<string, unknown> = {}
		for (const [key, nestedValue] of Object.entries(value)) {
			if (isBlockedObjectKey(key)) continue
			sanitized[key] = sanitizeJsonValue(nestedValue)
		}
		return sanitized
	}

	return value
}

/** The verification outputs one requested output selector covers. */
function outputsFor(selector: string): VerificationOutput[] {
	if (selector === '*') return [...VERIFICATION_OUTPUTS]
	return VERIFICATION_OUTPUTS.filter(
		(output) => output === selector || output.startsWith(`${selector}.`),
	)
}

/** Most contract entries a built output selection keeps; real inputs select far fewer. */
export const MAX_SELECTED_CONTRACTS = 1_024

/** Outputs every selected contract gets, since a verification job always reads them. */
const REQUIRED_OUTPUTS: readonly VerificationOutput[] = [
	'evm.bytecode.object',
	'evm.bytecode.linkReferences',
	'evm.deployedBytecode.object',
	'evm.deployedBytecode.linkReferences',
	'evm.deployedBytecode.immutableReferences',
]

/** The verification outputs for one contract's requested selectors, always with the required ones. */
function contractOutputs(selectors: unknown[]): VerificationOutput[] {
	const selected = new Set<VerificationOutput>(REQUIRED_OUTPUTS)
	for (const selector of selectors) {
		if (typeof selector !== 'string') continue
		for (const output of outputsFor(selector)) selected.add(output)
	}
	return VERIFICATION_OUTPUTS.filter((output) => selected.has(output))
}

/**
 * Builds the output selection for a compile. It keeps the files and contracts the caller selected,
 * so only those are code-generated, and limits each contract's outputs to the ones a verification
 * job reads, always including the bytecode it compares. File-level outputs (such as the AST) are
 * dropped. A caller that selects no contract, or more than MAX_SELECTED_CONTRACTS of them, gets
 * every output for every contract.
 */
export function verificationOutputSelection(
	requested: unknown,
): Record<string, Record<string, string[]>> {
	const selection: Record<string, Record<string, string[]>> = {}
	let selectedContracts = 0
	if (isPlainObject(requested)) {
		for (const [file, fileSelection] of Object.entries(requested)) {
			if (isBlockedObjectKey(file) || !isPlainObject(fileSelection)) continue
			const contracts: Record<string, string[]> = {}
			for (const [contract, selectors] of Object.entries(fileSelection)) {
				if (contract === '' || isBlockedObjectKey(contract)) continue
				if (!Array.isArray(selectors)) continue
				selectedContracts += 1
				// Past the cap, compile every contract with the bounded output list instead, so the
				// target is never dropped.
				if (selectedContracts > MAX_SELECTED_CONTRACTS) return allOutputs()
				contracts[contract] = contractOutputs(selectors)
			}
			if (Object.keys(contracts).length > 0) selection[file] = contracts
		}
	}

	if (Object.keys(selection).length > 0) return selection
	return allOutputs()
}

/** Every verification output for every contract. */
function allOutputs(): Record<string, Record<string, string[]>> {
	return { '*': { '*': [...VERIFICATION_OUTPUTS] } }
}

/** Solidity (solc and solar) settings, from the allowlist. */
export function allowlistSoliditySettings(
	settings: unknown,
): Record<string, unknown> {
	const source = isPlainObject(settings) ? settings : {}
	const allowed: Record<string, unknown> = {}

	for (const key of FORWARDED_SETTINGS)
		if (Object.hasOwn(source, key))
			allowed[key] = sanitizeJsonValue(source[key])

	if (isPlainObject(source.debug)) {
		const debug: Record<string, unknown> = {}
		for (const key of FORWARDED_DEBUG_SETTINGS)
			if (Object.hasOwn(source.debug, key))
				debug[key] = sanitizeJsonValue(source.debug[key])
		if (Object.keys(debug).length > 0) allowed.debug = debug
	}

	allowed.outputSelection = verificationOutputSelection(source.outputSelection)
	return allowed
}

/**
 * Compiler settings for a compile in `language`. Vyper settings keep their keys (Vyper has no
 * model checker), without prototype keys; every other language takes the Solidity allowlist.
 */
export function sanitizeCompilerSettings(
	language: string | undefined,
	settings: unknown,
): Record<string, unknown> {
	if (language?.toLowerCase() === 'vyper')
		return isPlainObject(settings)
			? (sanitizeJsonValue(settings) as Record<string, unknown>)
			: {}
	return allowlistSoliditySettings(settings)
}
