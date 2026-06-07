import { Instance, Server } from 'prool'
import * as TestContainers from 'prool/testcontainers'

export const port = 9655

function isBinaryPath(value: string) {
	return (
		value.startsWith('/') || value.startsWith('./') || value.startsWith('../')
	)
}

export async function createServer(tag = 'latest') {
	return Server.create({
		instance: isBinaryPath(tag)
			? Instance.tempo({
					binary: tag,
					blockTime: '2ms',
					port,
				})
			: TestContainers.Instance.tempo({
					blockTime: '2ms',
					port,
					image: `ghcr.io/tempoxyz/tempo:${tag}`,
				}),
		port,
	})
}
