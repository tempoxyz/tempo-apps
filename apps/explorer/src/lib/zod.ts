import { Address, Hex } from 'ox'
import { z } from 'zod/mini'

export const zAddress = (opts?: { lowercase?: boolean }) =>
	z.pipe(
		z.string(),
		z.transform((x) => {
			if (opts?.lowercase) x = x.toLowerCase()
			Address.assert(x)
			return x
		}),
	)

export const zHash = () =>
	z.pipe(
		z.string(),
		z.transform((x) => {
			Hex.assert(x)
			if (Hex.size(x) !== 32) throw new Error('Invalid hash length')
			return x
		}),
	)
