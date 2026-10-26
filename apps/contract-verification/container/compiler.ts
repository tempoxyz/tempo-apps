import * as NodeFS from 'node:fs/promises'

import solarBuilds from './solar-builds.json' with { type: 'json' }

const GITHUB_BASE_URL = 'https://github.com'

const SOLC_CACHE_DIR = '/tmp/solc-cache'
const SOLC_BINARIES_URL = 'https://binaries.soliditylang.org'
const SOLC_GITHUB_RELEASES_URL = `${GITHUB_BASE_URL}/argotorg/solidity/releases/download`

const VYPER_CACHE_DIR = '/tmp/vyper-cache'
const VYPER_GITHUB_RELEASES_URL = `${GITHUB_BASE_URL}/vyperlang/vyper/releases/download`

export async function getSolcPath(requestedVersion: string) {
	await NodeFS.mkdir(SOLC_CACHE_DIR, { recursive: true })

	const version = cleanSolcVersion(requestedVersion)
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
			`GitHub download failed for ${version} (${githubUrl}): ${response.status}`,
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
	// Vyper versions can be: 0.3.10, v0.3.10, 0.3.10+commit.XXXXXXX
	const cleaned = requestedVersion.replace(/^v/, '')
	const match = /^(\d+\.\d+\.\d+)(?:\+commit\.[0-9a-f]+)?$/.exec(cleaned)
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
			assets: { name: string; browser_download_url: string }[]
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

/** Strip leading `v` prefix and validate solc semver+commit format. Returns the cleaned version or throws. */
export function cleanSolcVersion(requestedVersion: string): string {
	const cleaned = requestedVersion.replace(/^v/, '')
	const match = /^0\.\d+\.\d+(?:\+commit\.[0-9a-f]{8})?$/.exec(cleaned)
	if (!match)
		throw new Error(`Unsupported compilerVersion: ${requestedVersion}`)
	return match[0]
}

export type SolarBuild = {
	/** Full git commit of paradigmxyz/solar that the build was installed from. */
	rev: string
	/** solar's own package version, which its metadata and CBOR auxdata report. */
	version: string
}

export type SolarVersion = {
	/** The solc version solar presents itself as (`SOLC_WRAPPER_VERSION`). */
	solcVersion: string
	/** The abbreviated solar commit from its version string. */
	commit: string
	/** solar's own package version. */
	solarVersion: string
}

/**
 * Parses the solc-compatible version solar reports with `SOLC_WRAPPER=1`, which Forge sends as
 * `compilerVersion` when `solc` points at solar, such as `0.8.36+commit.d83529b.solar.0.2.0`.
 * Returns null for any other compiler version.
 */
export function parseSolarVersion(
	compilerVersion: string,
): SolarVersion | null {
	const match =
		/^v?(\d+\.\d+\.\d+)\+commit\.([0-9a-f]{7,40})\.solar\.(\d+\.\d+\.\d+)$/.exec(
			compilerVersion,
		)
	if (!match) return null
	const [, solcVersion, commit, solarVersion] = match
	if (!solcVersion || !commit || !solarVersion) return null
	return { solcVersion, commit, solarVersion }
}

/**
 * Finds the pinned solar build a version string names. Solar publishes no binaries for arbitrary
 * commits, so the container only runs the builds listed in `solar-builds.json`, which the
 * Dockerfile compiles from source at their full commit.
 */
export function resolveSolarBuild(
	compilerVersion: string,
	builds: readonly SolarBuild[] = solarBuilds,
): SolarBuild & SolarVersion {
	const parsed = parseSolarVersion(compilerVersion)
	if (!parsed)
		throw new Error(`Not a solar compilerVersion: ${compilerVersion}`)
	const matches = builds.filter(
		(build) =>
			build.rev.startsWith(parsed.commit) &&
			build.version === parsed.solarVersion,
	)
	const [build] = matches
	if (!build || matches.length > 1) {
		const supported = builds
			.map((b) => `${b.rev.slice(0, 7)} (${b.version})`)
			.join(', ')
		throw new Error(
			`Unsupported solar build ${parsed.commit} (${parsed.solarVersion}); supported builds: ${supported}`,
		)
	}
	return { ...build, ...parsed }
}

/** Path to the installed solar binary for a solar compilerVersion. */
export async function getSolarPath(compilerVersion: string) {
	const build = resolveSolarBuild(compilerVersion)
	// The Dockerfile installs each pinned build as /opt/solar/<rev>/bin/solar.
	const installDir = Bun.env.SOLAR_INSTALL_DIR ?? '/opt/solar'
	const fsPath = `${installDir}/${build.rev}/bin/solar`
	const stat = await Bun.file(fsPath)
		.stat()
		.catch(() => null)
	if (!stat?.size)
		throw new Error(`solar ${build.rev} is not installed at ${fsPath}`)
	return { path: fsPath, build }
}
