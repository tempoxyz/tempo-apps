import { env } from 'cloudflare:workers'

export function getPrestoAuthSync(): string | undefined {
	const auth = env.PRESTO_RPC_AUTH as string | undefined
	if (!auth) return undefined
	return `Basic ${btoa(auth)}`
}
