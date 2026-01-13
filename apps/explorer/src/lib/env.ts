import { createIsomorphicFn } from '@tanstack/react-start'

export type TempoEnv = 'testnet' | 'moderato' | 'devnet' | 'presto'

export const getTempoEnv = createIsomorphicFn()
	.client(() => import.meta.env.VITE_TEMPO_ENV as TempoEnv)
	.server(() => process.env.VITE_TEMPO_ENV as TempoEnv)

export const isTestnet = createIsomorphicFn()
	.client(
		() =>
			import.meta.env.VITE_TEMPO_ENV === 'testnet' ||
			import.meta.env.VITE_TEMPO_ENV === 'moderato',
	)
	.server(
		() =>
			process.env.VITE_TEMPO_ENV === 'testnet' ||
			process.env.VITE_TEMPO_ENV === 'moderato',
	)

export const hasIndexSupply = createIsomorphicFn()
	.client(
		() =>
			import.meta.env.VITE_TEMPO_ENV === 'testnet' ||
			import.meta.env.VITE_TEMPO_ENV === 'moderato' ||
			import.meta.env.VITE_TEMPO_ENV === 'presto',
	)
	.server(
		() =>
			process.env.VITE_TEMPO_ENV === 'testnet' ||
			process.env.VITE_TEMPO_ENV === 'moderato' ||
			process.env.VITE_TEMPO_ENV === 'presto',
	)
