import {
	type AuxdataStyle,
	type MatchBytecodeOptions,
	matchBytecode,
} from '#lib/bytecode-matching.ts'
import type { LinkReferences } from '#schema.ts'

/**
 * Matches a deployment's onchain initcode against the recompiled creation bytecode, as Sourcify
 * does, and returns the verified_contracts creation columns. Without onchain initcode, or when it
 * does not match, the creation is recorded as not matched (`creationMatch: false`), never partial.
 */
export function creationMatchColumns(options: {
	onchainCreationBytecode: string | null | undefined
	recompiledCreationBytecode: string
	linkReferences?: LinkReferences | undefined
	auxdataStyle: AuxdataStyle
	abi: MatchBytecodeOptions['abi']
}): {
	creationMatch: boolean
	creationMetadataMatch: boolean | null
	creationValues: string | null
	creationTransformations: string | null
} {
	const result = options.onchainCreationBytecode
		? matchBytecode({
				onchainBytecode: options.onchainCreationBytecode,
				recompiledBytecode: options.recompiledCreationBytecode,
				isCreation: true,
				linkReferences: options.linkReferences,
				auxdataStyle: options.auxdataStyle,
				abi: options.abi,
			})
		: null
	if (!result?.match)
		return {
			creationMatch: false,
			creationMetadataMatch: null,
			creationValues: null,
			creationTransformations: null,
		}
	return {
		creationMatch: true,
		creationMetadataMatch: result.match === 'exact_match',
		creationValues:
			Object.keys(result.transformationValues).length > 0
				? JSON.stringify(result.transformationValues)
				: null,
		creationTransformations:
			result.transformations.length > 0
				? JSON.stringify(result.transformations)
				: null,
	}
}
