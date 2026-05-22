import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import app from './dist/server/index.js'

const port = Number.parseInt(process.env.PORT ?? '3000', 10)
const clientDir = join(process.cwd(), 'dist/client')

const contentTypes = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.txt': 'text/plain; charset=utf-8',
	'.webp': 'image/webp',
}

async function sendStatic(requestUrl, response) {
	const pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname)
	const normalized = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
	const filePath = join(clientDir, normalized === '/' ? 'index.html' : normalized)

	if (!filePath.startsWith(clientDir)) {
		return false
	}

	try {
		const file = await stat(filePath)
		if (!file.isFile()) {
			return false
		}

		response.writeHead(200, {
			'content-length': file.size,
			'content-type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
		})
		createReadStream(filePath).pipe(response)
		return true
	} catch {
		return false
	}
}

function toFetchRequest(request) {
	const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
	return new Request(url, {
		method: request.method,
		headers: request.headers,
		body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request,
		duplex: 'half',
	})
}

async function sendFetchResponse(fetchResponse, response) {
	response.writeHead(fetchResponse.status, Object.fromEntries(fetchResponse.headers))

	if (!fetchResponse.body) {
		response.end()
		return
	}

	for await (const chunk of fetchResponse.body) {
		response.write(chunk)
	}
	response.end()
}

createServer(async (request, response) => {
	try {
		if (request.url === '/health') {
			response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
			response.end('ok')
			return
		}

		if (await sendStatic(request.url ?? '/', response)) {
			return
		}

		await sendFetchResponse(await app.fetch(toFetchRequest(request), process.env), response)
	} catch (error) {
		console.error(error)
		response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
		response.end('Internal Server Error')
	}
}).listen(port, '0.0.0.0')
