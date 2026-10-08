import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { Readable } from 'node:stream'
import entry from '../dist/server/server.js'

const chainId = Number(process.env.PREVIEW_CHAIN_ID)
if (
	!Number.isSafeInteger(chainId) ||
	chainId <= 0 ||
	[4217, 42431].includes(chainId)
)
	throw new Error('PREVIEW_CHAIN_ID must identify a development chain')
if (
	!process.env.PREVIEW_RPC_URL ||
	!process.env.TEMPO_API_URL ||
	!process.env.TEMPO_API_KEY
)
	throw new Error('Preview RPC, API URL and API key are required')

const root = resolve('dist/client')
const types = {
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.woff2': 'font/woff2',
	'.ico': 'image/x-icon',
	'.json': 'application/json',
}
const config = `<script>window.__TEMPO_PREVIEW__=${JSON.stringify({ chainId })}</script>`
const server = createServer(async (incoming, outgoing) => {
	try {
		const origin = new URL(
			process.env.APP_URL || `http://localhost:${process.env.PORT || 8080}`,
		)
		const url = new URL(incoming.url, origin)
		if (url.pathname === '/healthz') {
			outgoing.writeHead(200, { 'content-type': 'application/json' })
			outgoing.end(JSON.stringify({ chainId, status: 'ok' }))
			return
		}
		const file = resolve(root, `.${decodeURIComponent(url.pathname)}`)
		if (
			file.startsWith(`${root}${sep}`) &&
			types[extname(file)] &&
			['GET', 'HEAD'].includes(incoming.method)
		) {
			try {
				const body = await readFile(file)
				outgoing.writeHead(200, { 'content-type': types[extname(file)] })
				outgoing.end(incoming.method === 'HEAD' ? undefined : body)
				return
			} catch (error) {
				if (error.code !== 'ENOENT') throw error
			}
		}
		const request = new Request(url, {
			method: incoming.method,
			headers: incoming.headers,
			...(!['GET', 'HEAD'].includes(incoming.method)
				? { body: Readable.toWeb(incoming), duplex: 'half' }
				: {}),
		})
		const response = await entry.fetch(request)
		response.headers.set('x-robots-tag', 'noindex, nofollow')
		if (response.headers.get('content-type')?.includes('text/html')) {
			const body = (await response.text()).replace('<head>', `<head>${config}`)
			response.headers.delete('content-length')
			outgoing.writeHead(response.status, Object.fromEntries(response.headers))
			outgoing.end(body)
		} else {
			outgoing.writeHead(response.status, Object.fromEntries(response.headers))
			if (response.body) Readable.fromWeb(response.body).pipe(outgoing)
			else outgoing.end()
		}
	} catch (error) {
		console.error(
			'Preview request failed',
			error instanceof Error ? error.message : 'unknown error',
		)
		if (!outgoing.headersSent) outgoing.writeHead(500)
		outgoing.end('Preview request failed')
	}
})
server.listen(Number(process.env.PORT || 8080), '0.0.0.0')
process.on('SIGTERM', () => server.close(() => process.exit(0)))
