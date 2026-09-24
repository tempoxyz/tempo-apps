import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { setTimeout } from 'node:timers/promises'

// Run against the production-build fixture preview; requires agent-browser.
const origin = process.env.FEE_AMM_TEST_URL ?? 'http://localhost:3011'
const token = '0x20c0000000000000000000006a37da5c996874be'
const scoped = `/fee-amm?token=${token}`
function browser(...args: string[]) {
	return execFileSync(
		'agent-browser',
		[
			'--session',
			'fee-amm-regression',
			'--args',
			'--no-sandbox,--disable-dev-shm-usage',
			'--ignore-https-errors',
			...args,
		],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
	).trim()
}
function evaluate(expression: string) {
	return JSON.parse(browser('eval', expression))
}
function click(selector: string) {
	evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
}
async function contains(text: string) {
	for (let attempt = 0; attempt < 240; attempt++) {
		if (browser('get', 'text', 'main').includes(text)) return
		await setTimeout(250)
	}
	assert.fail(`Expected page to contain: ${text}`)
}
async function open(path: string) {
	browser('open', `${origin}${path}`)
}
async function control(query = '') {
	const response = await fetch(`http://localhost:4018/control${query}`)
	assert.equal(response.status, 200)
}

try {
	await control()
	await open('/fee-amm')
	await contains('10 pools on this page')
	assert.ok(!browser('get', 'text', 'main').includes('OUSD'))
	click('nav[aria-label="Fee AMM pagination"] a[title="Next page"]')
	await contains('Page 2')
	await contains('OUSD')
	assert.ok(browser('get', 'url').includes('page=2'))
	browser('reload')
	await contains('Page 2')
	click('nav[aria-label="Fee AMM pagination"] a[title="Previous page"]')
	await contains('Page 1')
	browser('select', 'select[aria-label="Pools per page"]', '25')
	await contains('12 pools on this page')
	assert.ok(browser('get', 'url').includes('limit=25'))
	assert.ok(!browser('get', 'url').includes('page=2'))

	await open(scoped)
	await contains('Filtered by OUSD')
	assert.equal(
		evaluate('document.querySelector("main h1").textContent'),
		'Fee AMM',
	)
	await contains('0.000024')
	await contains('49.999977')
	// Includes SSR images that fail before hydration attaches error handlers.
	browser(
		'wait',
		'--fn',
		'[...document.querySelectorAll("main img")].length > 0 && [...document.querySelectorAll("main img")].every(i => i.complete && i.naturalWidth > 0 && i.getAttribute("src") === "/token-fallback.svg")',
	)
	browser('click', 'button[aria-label="Copy link"]')
	assert.equal(
		evaluate(
			'document.querySelector("button[aria-label=\\"Copy link\\"]").title',
		),
		'Copied!',
	)
	click('main a[href*="/address/"]')
	await contains('Fee AMM liquidity')
	assert.ok(browser('get', 'url').includes('tab=token'))
	click('section[aria-label="Fee AMM liquidity"] a')
	await contains('Filtered by OUSD')
	assert.ok(browser('get', 'url').includes(`token=${token}`))
	click('main form a')
	await contains('10 pools on this page')
	assert.ok(!browser('get', 'url').includes('token='))
	const validatorToken = '0x20c0000000000000000000000000000000000000'
	await open(`/fee-amm?token=${validatorToken}`)
	click('nav[aria-label="Fee AMM pagination"] a[title="Next page"]')
	await contains('Page 2')
	assert.ok(browser('get', 'url').includes(`token=${validatorToken}`))
	browser('select', 'select[aria-label="Pools per page"]', '25')
	await contains('Page 1')
	assert.ok(browser('get', 'url').includes(`token=${validatorToken}`))
	await open(`/token/${token}?tab=token`)
	await contains('Fee AMM liquidity')
	assert.ok(browser('get', 'url').includes('tab=token'))

	await control('?failed=true')
	await open(scoped)
	await contains('Fee AMM liquidity is temporarily unavailable.')
	assert.ok(!browser('get', 'text', 'main').includes('No Fee AMM pools'))
	await control()
	click('[role="alert"] button')
	await contains('49.999977')
	await control('?missingReserves=true')
	await open(scoped)
	await contains('Unavailable')
	assert.ok(!browser('get', 'text', 'main').includes('49.999977'))
	await control()
	await open('/fee-amm?token=0x20c0000000000000000000000000000000000099')
	await contains('No Fee AMM pools found for this token.')
	await open('/fee-amm?page=0')
	await contains('Invalid Fee AMM link')
	await open(scoped)
	browser('fill', 'input[name="token"]', 'invalid')
	click('main form button[type="submit"]')
	await contains('Enter a valid token contract address.')
	await open(scoped)
	browser('set', 'viewport', '390', '844')
	assert.ok(
		evaluate('document.documentElement.scrollWidth <= window.innerWidth'),
	)
	click('button[aria-label="Switch to dark mode"]')
	assert.equal(evaluate('document.documentElement.dataset.theme'), 'dark')
	// Even if the bundled fallback fails, do not bounce back to the API forever.
	evaluate(
		'document.querySelector("main img").dispatchEvent(new Event("error"))',
	)
	assert.equal(
		evaluate('document.querySelector("main img").getAttribute("src")'),
		'/token-fallback.svg',
	)
	console.log(
		'Fee AMM browser checks passed: pagination, direct links, Token tab, retry, missing reserves, validation, and mobile layout.',
	)
} finally {
	await control()
	browser('close')
}
