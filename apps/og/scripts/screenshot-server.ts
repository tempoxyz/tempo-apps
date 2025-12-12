/**
 * Local screenshot server for OG image development
 * Run with: pnpm tsx scripts/screenshot-server.ts
 */

import http from 'node:http'
import { URL } from 'node:url'
import puppeteer, { type Browser } from 'puppeteer'

const PORT = 3001
const EXPLORER_URL = 'http://localhost:3000'

let browser: Browser | null = null

async function getBrowser() {
	if (!browser) {
		console.log('Launching browser...')
		browser = await puppeteer.launch({
			headless: true,
			args: ['--no-sandbox', '--disable-setuid-sandbox'],
		})
	}
	return browser
}

async function takeScreenshot(hash: string): Promise<Buffer> {
	const b = await getBrowser()
	const page = await b.newPage()

	try {
		// Set viewport to capture the receipt nicely (Receipt component is 360px wide)
		await page.setViewport({
			width: 420,
			height: 900,
			deviceScaleFactor: 2,
		})

		// Navigate to the receipt page
		const receiptUrl = `${EXPLORER_URL}/receipt/${hash}`
		console.log(`Taking screenshot of: ${receiptUrl}`)
		await page.goto(receiptUrl, { waitUntil: 'networkidle0' })

		// Wait for the receipt to render
		await page
			.waitForSelector('[data-receipt]', { timeout: 15000 })
			.catch(() => {
				console.log('data-receipt selector not found')
			})

		// Take screenshot of the receipt element
		const receiptElement = await page.$('[data-receipt]')
		let screenshot: Buffer

		if (receiptElement) {
			screenshot = (await receiptElement.screenshot({ type: 'png' })) as Buffer
		} else {
			// Fallback to centered area - Receipt is 360px wide, centered in 420px viewport
			screenshot = (await page.screenshot({
				type: 'png',
				clip: { x: 20, y: 80, width: 380, height: 650 },
			})) as Buffer
		}

		return screenshot
	} finally {
		await page.close()
	}
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url || '/', `http://localhost:${PORT}`)

	// CORS headers
	res.setHeader('Access-Control-Allow-Origin', '*')
	res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

	if (req.method === 'OPTIONS') {
		res.writeHead(204)
		res.end()
		return
	}

	// Health check
	if (url.pathname === '/health') {
		res.writeHead(200, { 'Content-Type': 'text/plain' })
		res.end('OK')
		return
	}

	// Screenshot endpoint: /screenshot/:hash
	const match = url.pathname.match(/^\/screenshot\/(.+)$/)
	if (match) {
		const hash = match[1]

		if (!hash || !hash.startsWith('0x') || hash.length !== 66) {
			res.writeHead(400, { 'Content-Type': 'text/plain' })
			res.end('Invalid hash')
			return
		}

		try {
			const screenshot = await takeScreenshot(hash)
			res.writeHead(200, {
				'Content-Type': 'image/png',
				'Content-Length': screenshot.length,
			})
			res.end(screenshot)
		} catch (error) {
			console.error('Screenshot error:', error)
			res.writeHead(500, { 'Content-Type': 'text/plain' })
			res.end(
				`Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
			)
		}
		return
	}

	res.writeHead(404, { 'Content-Type': 'text/plain' })
	res.end('Not found')
})

server.listen(PORT, () => {
	console.log(`Screenshot server running at http://localhost:${PORT}`)
	console.log(`\nEndpoints:`)
	console.log(`  GET /health - Health check`)
	console.log(`  GET /screenshot/:hash - Take screenshot of receipt`)
	console.log(`\nMake sure the explorer is running at ${EXPLORER_URL}`)
})

// Cleanup on exit
process.on('SIGINT', async () => {
	console.log('\nShutting down...')
	if (browser) {
		await browser.close()
	}
	process.exit(0)
})
