import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import { z } from 'zod/mini'

export const zAddress = (opts?: { lowercase?: boolean }) =>
	z.pipe(
		z.string(),
		z.transform((x) => {
			if (opts?.lowercase) x = x.toLowerCase()
			return Address.from(x)
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
