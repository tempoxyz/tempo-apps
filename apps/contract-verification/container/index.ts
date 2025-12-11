import * as NodeFS from 'node:fs/promises'
import * as Bun from 'bun'

const headers = new Headers({
	'X-Request-Id': Bun.randomUUIDv7(),
})

const SOLC_CACHE_DIR = '/tmp/solc-cache'
const SOLC_BINARIES_URL = 'https://binaries.soliditylang.org'
const SOLC_GITHUB_RELEASES_URL =
	'https://github.com/argotorg/solidity/releases/download'

async function getSolcPath(requestedVersion: string) {
	await NodeFS.mkdir(SOLC_CACHE_DIR, { recursive: true })

	// Sanitize the version string (semver: i.e. `0.8.26` or `0.8.26+commit.XXXXXXX`)
	const match = requestedVersion.match(
		/^0\.\d+\.\d+(?:\+commit\.[0-9a-f]{8})?$/,
	)
	if (!match)
		throw new Error(`Unsupported compilerVersion: ${requestedVersion}`)

	const [version] = match
	const [tagVersion] = version.split('+')

	const fsPath = `${SOLC_CACHE_DIR}/solc-${version}`

	// 2. If we already have it, reuse
	try {
		const stat = await Bun.file(fsPath).stat()
		if (stat?.size && stat.size > 0) return fsPath
	} catch {
		// fall through to download
	}

	// 3. Download solc: try GitHub releases first, then fall back to solc-bin mirror.
	// GitHub: https://github.com/argotorg/solidity/releases/download/v${tagVersion}/solc-static-linux
	// Mirror: https://binaries.soliditylang.org/linux-amd64/solc-linux-amd64-v${version}
	let response: Response

	const githubUrl = `${SOLC_GITHUB_RELEASES_URL}/v${tagVersion}/solc-static-linux`
	response = await fetch(githubUrl)

	if (!response.ok) {
		console.warn(
			`[solc] GitHub download failed for ${version} (${githubUrl}): ${response.status}`,
		)

		const binariesUrl = `${SOLC_BINARIES_URL}/linux-amd64/solc-linux-amd64-v${version}`
		const fallbackResponse = await fetch(binariesUrl)

		if (!fallbackResponse.ok) {
			throw new Error(
				`Failed to download solc ${version}: GitHub ${response.status}, binaries.soliditylang.org ${fallbackResponse.status}`,
			)
		}

		response = fallbackResponse
	}

	const bytes = new Uint8Array(await response.arrayBuffer())

	await Bun.write(fsPath, bytes)
	await NodeFS.chmod(fsPath, 0o755)

	return fsPath
}

const server = Bun.serve({
	port: 80_80,
	development: Bun.env.NODE_ENV === 'development',
	routes: {
		'/compile': {
			POST: async (request, server) => {
				const address = server.requestIP(request as Request)
				if (address)
					console.info(
						`[/compile] request IP address: ${address.address}:${address.port}`,
					)

				const body = await request.json<{
					input: object
					compilerVersion: string
				}>()
				if (!Object.hasOwn(body, 'input'))
					return Response.json({ error: 'Missing input' }, { status: 400 })

				if (!Object.hasOwn(body, 'compilerVersion'))
					return Response.json(
						{ error: 'Missing compilerVersion' },
						{ status: 400 },
					)

				const solcPath = await getSolcPath(body.compilerVersion)

				// solc --standard-json reads from stdin
				const proc = Bun.spawn([solcPath, '--standard-json'], {
					stdin: new TextEncoder().encode(JSON.stringify(body.input)),
					stdout: 'pipe',
					stderr: 'pipe',
				})

				const stdout = await new Response(proc.stdout).text()
				const stderr = await new Response(proc.stderr).text()
				await proc.exited

				if (stderr) console.error('[compile] stderr:', stderr)

				if (!stdout)
					return Response.json(
						{ error: 'Failed to compile', stderr },
						{ status: 500 },
					)

				try {
					const output = JSON.parse(stdout)
					return Response.json(output, { status: 200 })
				} catch (error) {
					console.error('[compile] Failed to parse solc output:', error)
					return Response.json(
						{ error: 'Failed to parse solc output', stdout, stderr },
						{ status: 500 },
					)
				}
			},
		},
		'/health': new Response('ok'),
		'/metrics': (_, server) =>
			new Response(`Active requests: ${server.pendingRequests}`),
	},
	error: (error) => {
		console.error(Bun.color('red', 'ansi'), JSON.stringify(error, undefined, 2))
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error'
		return new Response(errorMessage, { status: 500, headers })
	},
})

if (Bun.env.NODE_ENV === 'development')
	console.info(
		`Server is running on`,
		Bun.color('#4DFA7B', 'ansi'),
		server.url.toString().replaceAll(`${server.port}/`, `${server.port}`),
	)
else console.info(`Server started on port ${server.port}`)
