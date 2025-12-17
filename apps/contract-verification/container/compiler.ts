import * as NodeFS from 'node:fs/promises'

const GITHUB_BASE_URL = 'https://github.com'

const SOLC_CACHE_DIR = '/tmp/solc-cache'
const SOLC_BINARIES_URL = 'https://binaries.soliditylang.org'
const SOLC_GITHUB_RELEASES_URL = `${GITHUB_BASE_URL}/argotorg/solidity/releases/download`

const VYPER_CACHE_DIR = '/tmp/vyper-cache'
const VYPER_GITHUB_RELEASES_URL = `${GITHUB_BASE_URL}/vyperlang/vyper/releases/download`

export async function getSolcPath(requestedVersion: string) {
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

export async function getVyperPath(requestedVersion: string) {
	await NodeFS.mkdir(VYPER_CACHE_DIR, { recursive: true })

	// Sanitize the version string
	// Vyper versions can be: 0.3.10, 0.4.0, 0.4.1, v0.3.10, 0.3.10+commit.XXXXXXX
	const cleaned = requestedVersion.replace(/^v/, '')
	const match = cleaned.match(/^(\d+\.\d+\.\d+)(?:\+commit\.[0-9a-f]+)?$/)
	if (!match) throw new Error(`Unsupported Vyper version: ${requestedVersion}`)

	const [, version] = match
	const fsPath = `${VYPER_CACHE_DIR}/vyper-${version}`

	// If we already have it, reuse
	try {
		const stat = await Bun.file(fsPath).stat()
		if (stat?.size && stat.size > 0) return fsPath
	} catch {
		// fall through to download
	}

	// Download vyper from GitHub releases
	// The naming varies by version, so we fetch the release assets to find the correct file
	const releaseApiUrl = `https://api.github.com/repos/vyperlang/vyper/releases/tags/v${version}`
	const releaseResponse = await fetch(releaseApiUrl, {
		headers: { Accept: 'application/vnd.github.v3+json' },
	})

	let response: Response | null = null

	if (releaseResponse.ok) {
		const release = (await releaseResponse.json()) as {
			assets: Array<{ name: string; browser_download_url: string }>
		}
		const linuxAsset = release.assets.find(
			(a) => a.name.endsWith('.linux') && a.name.startsWith(`vyper.${version}`),
		)
		if (linuxAsset) {
			response = await fetch(linuxAsset.browser_download_url)
		}
	}

	// Fallback to simple pattern for older versions
	if (!response?.ok) {
		const simpleUrl = `${VYPER_GITHUB_RELEASES_URL}/v${version}/vyper.${version}.linux`
		response = await fetch(simpleUrl)
	}

	if (!response?.ok)
		throw new Error(
			`Failed to download Vyper ${version}: release not found or no linux binary available`,
		)

	const bytes = new Uint8Array(await response.arrayBuffer())

	await Bun.write(fsPath, bytes)
	await NodeFS.chmod(fsPath, 0o755)

	return fsPath
}
