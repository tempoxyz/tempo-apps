import * as z from 'zod/mini'

// TanStack parses JSON search values before validation (e.g. ?a=444 becomes
// a number). Ignore invalid optional filters rather than failing the route.
export const accountFilterSearchSchema = z.catch(
	z.optional(z.string()),
	undefined,
)
