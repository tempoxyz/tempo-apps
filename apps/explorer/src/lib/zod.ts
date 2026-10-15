import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import { z } from 'zod/mini'

/** Marks a string schema as `0x` hex in its JSON Schema, which `/llms.txt` reads. */
export const hex = () => z.meta({ format: 'hex' })

export const zAddress = (opts?: { lowercase?: boolean }) =>
	z.pipe(
		z.string().check(hex(), (ctx) => {
			if (!Address.validate(ctx.value))
				ctx.issues.push({
					code: 'custom',
					input: ctx.value,
					message: 'Invalid address',
				})
		}),
		z.transform((x) => {
			if (opts?.lowercase) x = x.toLowerCase()
			return Address.from(x)
		}),
	)

export const zHash = () =>
	z.pipe(
		z.string().check(hex(), (ctx) => {
			if (!Hex.validate(ctx.value) || Hex.size(ctx.value) !== 32)
				ctx.issues.push({
					code: 'custom',
					input: ctx.value,
					message: 'Invalid 32-byte hash',
				})
		}),
		z.transform((x) => x as Hex.Hex),
	)
