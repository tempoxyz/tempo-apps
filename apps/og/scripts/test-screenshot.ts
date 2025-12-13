/**
 * Local test script to take a screenshot of the receipt page
 * Run with: pnpm tsx scripts/test-screenshot.ts
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const EXPLORER_URL = 'http://localhost:3000'
const TEST_HASH =
	'0x6d6d8c102064e6dee44abad2024a8b1d37959230baab80e70efbf9b0c739c4fd'

async function main() {
	console.log('Launching browser...')
	const browser = await puppeteer.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox'],
	})

	const page = await browser.newPage()

	// Set viewport to capture the receipt nicely
	await page.setViewport({
		width: 500,
		height: 900,
		deviceScaleFactor: 2,
	})

	// Navigate to the receipt page
	const receiptUrl = `${EXPLORER_URL}/receipt/${TEST_HASH}`
	console.log(`Navigating to: ${receiptUrl}`)
	await page.goto(receiptUrl, { waitUntil: 'networkidle0' })

	// Wait for the receipt to render - try the receipt container
	console.log('Waiting for receipt element...')
	// The receipt component wrapper
	await page.waitForSelector('.font-mono', { timeout: 15000 }).catch(() => {
		console.log('Receipt not found, taking centered screenshot')
	})

	// Take screenshot of the centered receipt area
	const outputPath = path.join(
		__dirname,
		'..',
		'public',
		'receipt-screenshot.png',
	)

	// Try to find the receipt element by data attribute or fall back to page center
	const receiptElement = await page.$('[data-receipt]')

	if (receiptElement) {
		console.log('Taking screenshot of receipt element...')
		await receiptElement.screenshot({
			type: 'png',
			path: outputPath,
		})
	} else {
		// Get page dimensions and center on receipt
		console.log('Taking centered page screenshot...')
		const viewport = page.viewport()
		const width = viewport?.width || 500

		await page.screenshot({
			type: 'png',
			path: outputPath,
			clip: {
				x: (width - 400) / 2,
				y: 100,
				width: 400,
				height: 700,
			},
		})
	}

	await browser.close()

	console.log(`Screenshot saved to: ${outputPath}`)
	console.log('\nNow run the OG dev server and it will use this screenshot!')
}

main().catch(console.error)
