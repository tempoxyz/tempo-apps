import { createEnv } from '@t3-oss/env-core'
import * as z from 'zod/mini'

export const env = createEnv({
	server: {
		INDEXSUPPLY_API_KEY: z.string({
			error: 'INDEXSUPPLY_API_KEY is required',
		}),
	},
	clientPrefix: 'VITE_',
	client: {
		VITE_ENABLE_ERUDA: z.prefault(z.coerce.boolean(), false),
		VITE_ENABLE_COLOR_SCHEME_TOGGLE: z.prefault(z.coerce.boolean(), true),
	},
	runtimeEnvStrict: {
		INDEXSUPPLY_API_KEY: process.env.INDEXSUPPLY_API_KEY,
		VITE_ENABLE_ERUDA: import.meta.env.VITE_ENABLE_ERUDA,
		VITE_ENABLE_COLOR_SCHEME_TOGGLE: import.meta.env
			.VITE_ENABLE_COLOR_SCHEME_TOGGLE,
	},
})
