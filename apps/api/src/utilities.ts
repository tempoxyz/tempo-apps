import { Address } from 'ox'
import * as z from 'zod/mini'

import { wagmiConfig } from '#wagmi.config.ts'

export const zAddress = (opts?: { lowercase?: boolean }) =>
	z.pipe(
		z.string(),
		z.transform((x) => {
			if (opts?.lowercase) x = x.toLowerCase()
			Address.assert(x)
			return x
		}),
	)

export const zChainId = () =>
	z.pipe(
		z.coerce.number(),
		z.union(wagmiConfig.chains.map((chain) => z.literal(chain.id))),
	)
