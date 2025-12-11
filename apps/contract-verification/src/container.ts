import { Container } from '@cloudflare/containers'

export class VerificationContainer extends Container {
	defaultPort = 8080
	sleepAfter = '10m'
	enableInternet = true
	envVars = {
		ZKGM: 'hello',
	}
	entrypoint = ['node', '/usr/src/app/index.ts']

	override async onStart(): Promise<void> {
		console.log('onStart hook called')

		const response = await this.containerFetch('http://localhost:8080/health') // TODO: update domain
		if (!response.ok) throw new Error('Container health check failed')

		const data = await response.text()
		console.log('onStart hook called with data:', data)
	}

	override async onStop(): Promise<void> {
		console.log('onStop hook called')
	}

	override onError(error: unknown): unknown {
		console.log('onError hook called with error:', error)
		throw error
	}
}
