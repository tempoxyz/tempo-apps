import type { Address } from 'ox'

/**
 * Validator address to display name mapping.
 * These are well-known validators on the Tempo network.
 */
export const VALIDATOR_LABELS: Record<Lowercase<Address.Address>, string> = {
	'0x9899cd5b8190bfd9bbaee463f7bde4c7e687fdac': 'Tempo 1',
	'0xa1dd6fc0791b186654e246a8966b1a44854a4e27': 'Tempo 2',
	'0xde19771801afc496e1c4bb584bb5875322f68a4a': 'Tempo 3',
	'0xcf12263139789466d91b9fde920053bda20e7af5': 'Tempo 4',
	'0x0000000000000000000000000000000000000010': 'Stripe (inactive)',
	'0x0000000000000000000000000000000000000011': 'Stripe',
	'0x0000000000000000000000000000000000000012': 'Paradigm',
}

/**
 * Returns the display label for a validator address if known.
 */
export function getValidatorLabel(
	address: Address.Address | undefined,
): string | undefined {
	if (!address) return undefined
	return VALIDATOR_LABELS[address.toLowerCase() as Lowercase<Address.Address>]
}
