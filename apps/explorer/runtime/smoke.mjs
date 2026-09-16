import assert from 'node:assert/strict'

const origin = process.env.EXPLORER_ORIGIN || 'http://127.0.0.1:8080'
const page = await fetch(origin)
assert.equal(page.status, 200)
const html = await page.text()
assert.match(html, /<!DOCTYPE html>/i)
assert.doesNotMatch(html, /posthog\.init/)
const script = html.match(/"(\/assets\/[^" ]+\.js)"/)
assert.ok(script, 'SSR page must reference its client bundle')
const javascript = await fetch(`${origin}${script[1]}`)
assert.equal(javascript.status, 200)
assert.match(javascript.headers.get('content-type'), /javascript/)
const robots = await fetch(`${origin}/robots.txt`)
assert.equal(robots.status, 200)
assert.match(await robots.text(), /User-agent:/)
const asset = await fetch(`${origin}/favicon.ico`)
assert.equal(asset.status, 200)
assert.ok((await asset.arrayBuffer()).byteLength > 0)
const rpc = await fetch(`${origin}/api/rpc`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		jsonrpc: '2.0',
		id: 1,
		method: 'eth_sendRawTransaction',
		params: [],
	}),
})
assert.equal(rpc.status, 400)
assert.equal(await rpc.text(), 'Unsupported RPC request')
