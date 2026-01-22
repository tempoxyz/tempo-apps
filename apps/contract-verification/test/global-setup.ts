export default async function globalSetup() {
	const vitestEnv = process.env.VITEST_ENV ?? 'devnet'

	if (vitestEnv === 'mainnet' && !process.env.TEMPO_RPC_KEY)
		throw new Error('TEMPO_RPC_KEY is required for mainnet tests')
}
