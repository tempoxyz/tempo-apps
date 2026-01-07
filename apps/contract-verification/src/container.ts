import { Container, type StopParams } from '@cloudflare/containers'

export class VerificationContainer extends Container<Cloudflare.Env> {
	defaultPort = 8080
	sleepAfter = '10m'
	enableInternet = true

	override async onStart(): Promise<void> {
		console.log('onStart hook called')

		const response = await this.containerFetch('http://localhost:8080/health')
		if (!response.ok) throw new Error('Container health check failed')

		const data = await response.text()
		console.log('onStart hook called with data:', data)
	}

	override onStop(stopParams: StopParams): void {
		if (stopParams.exitCode === 0) console.log('Container stopped gracefully')
		else console.log('Container stopped with exit code:', stopParams.exitCode)

		console.log('Container stop reason:', stopParams.reason)
	}

	override onError(error: unknown): unknown {
		console.log('onError hook called with error:', error)
		throw error
	}
}
