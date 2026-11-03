import * as NodeFS from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'

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
	/** solar's own package version, such as 0.3.0, or 0.3.0-dev for a build that is not a release. */
	solarVersion: string
}

/**
 * Parses the solc-compatible version solar reports with `SOLC_WRAPPER=1`, which Forge sends as
 * `compilerVersion` for solar builds, such as `0.8.38+commit.e7a91fc7.solar.0.3.0` or, for the
 * solar Foundry bundles, `0.8.38+commit.a2b44354.solar.0.3.0-dev`. Returns null for any other
 * compiler version.
 */
export function parseSolarVersion(
	compilerVersion: string,
): SolarVersion | null {
	const match =
		/^v?(\d+\.\d+\.\d+)\+commit\.([0-9a-f]{7,40})\.solar\.(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(
			compilerVersion,
		)
	if (!match) return null
	const [, solcVersion, commit, solarVersion] = match
	if (!solcVersion || !commit || !solarVersion) return null
	return { solcVersion, commit, solarVersion }
}

/**
 * Finds the pinned solar build a version string names, among the builds in `solar-builds.json`,
 * which the Dockerfile compiles from source for commits solar published no binary of. Returns null
 * when none is pinned: such a version is downloaded instead (see `getSolarPath`).
 */
export function findPinnedSolarBuild(
	compilerVersion: string,
	builds: readonly SolarBuild[] = solarBuilds,
): (SolarBuild & SolarVersion) | null {
	const parsed = parseSolarVersion(compilerVersion)
	if (!parsed)
		throw new Error(`Not a solar compilerVersion: ${compilerVersion}`)
	const matches = builds.filter(
		(build) =>
			build.rev.startsWith(parsed.commit) &&
			build.version === parsed.solarVersion,
	)
	const [build] = matches
	if (!build || matches.length > 1) return null
	return { ...build, ...parsed }
}

const SOLAR_CACHE_DIR = '/tmp/solar-cache'
// Static musl build: runs on the distroless image natively, and through QEMU on arm64 hosts.
const SOLAR_PLATFORM = 'x86_64-unknown-linux-musl'
const SOLAR_GITHUB_RELEASES_URL = `${GITHUB_BASE_URL}/paradigmxyz/solar/releases/download`
// Sourcify's copies of solar builds that are not a release, such as the one Foundry bundles
// (`forge --use solar`), named solar-<platform>-v<version>+commit.<commit>.
const SOLAR_DEV_BUILDS_URL =
	'https://storage.googleapis.com/solar-dev-binary/solar'

/**
 * Path to the solar binary for a solar compilerVersion: a pinned build from `solar-builds.json`, or
 * else the release (from solar's GitHub releases) or development build (from Sourcify's copies, as
 * Sourcify itself does) that the version names, downloaded once and checked to report that exact
 * version and commit.
 */
export async function getSolarPath(compilerVersion: string) {
	const pinned = findPinnedSolarBuild(compilerVersion)
	if (pinned) {
		// The Dockerfile installs each pinned build as /opt/solar/<rev>/bin/solar.
		const installDir = Bun.env.SOLAR_INSTALL_DIR ?? '/opt/solar'
		const fsPath = `${installDir}/${pinned.rev}/bin/solar`
		const stat = await Bun.file(fsPath)
			.stat()
			.catch(() => null)
		if (!stat?.size)
			throw new Error(`solar ${pinned.rev} is not installed at ${fsPath}`)
		return { path: fsPath, version: pinned as SolarVersion }
	}

	const version = parseSolarVersion(compilerVersion)
	if (!version)
		throw new Error(`Not a solar compilerVersion: ${compilerVersion}`)
	const cacheDir = Bun.env.SOLAR_CACHE_DIR ?? SOLAR_CACHE_DIR
	await NodeFS.mkdir(cacheDir, { recursive: true })
	const fileName = `solar-${SOLAR_PLATFORM}-v${version.solarVersion}+commit.${version.commit}`
	const fsPath = `${cacheDir}/${fileName}`
	if (await isSolarBuild(fsPath, version)) return { path: fsPath, version }

	const binary = await downloadSolar(version, fileName)
	// Write under a unique name and rename, so a parallel request never runs a half-written binary.
	const tmpPath = `${fsPath}.${crypto.randomUUID()}.tmp`
	try {
		await Bun.write(tmpPath, binary)
		await NodeFS.chmod(tmpPath, 0o755)
		if (!(await isSolarBuild(tmpPath, version)))
			throw new Error(
				`Downloaded solar is not ${version.solarVersion}+commit.${version.commit}`,
			)
		await NodeFS.rename(tmpPath, fsPath)
	} finally {
		await NodeFS.rm(tmpPath, { force: true })
	}
	return { path: fsPath, version }
}

async function downloadSolar(
	version: SolarVersion,
	fileName: string,
): Promise<Uint8Array> {
	// A release tag names only solar's version, so isSolarBuild checks its commit afterwards.
	if (!version.solarVersion.includes('-')) {
		const url = `${SOLAR_GITHUB_RELEASES_URL}/v${version.solarVersion}/solar-${SOLAR_PLATFORM}.tar.gz`
		const response = await fetch(url)
		if (!response.ok)
			throw new Error(
				`Failed to download solar ${version.solarVersion}: ${url} returned ${response.status}`,
			)
		const binary = extractFileFromTarGz(
			new Uint8Array(await response.arrayBuffer()),
			`solar-${SOLAR_PLATFORM}/solar`,
		)
		if (!binary) throw new Error(`No solar binary in ${url}`)
		return binary
	}
	const url = `${SOLAR_DEV_BUILDS_URL}/${encodeURIComponent(fileName)}`
	const response = await fetch(url)
	if (!response.ok)
		throw new Error(
			`Unsupported solar build ${version.solarVersion}+commit.${version.commit}: it is not a release, and no copy of it is published (${response.status})`,
		)
	return new Uint8Array(await response.arrayBuffer())
}

/** Whether the binary at fsPath runs and reports exactly this solar version and commit. */
async function isSolarBuild(
	fsPath: string,
	version: SolarVersion,
): Promise<boolean> {
	const stat = await Bun.file(fsPath)
		.stat()
		.catch(() => null)
	if (!stat?.size) return false
	try {
		const proc = Bun.spawn([fsPath, '--version'], {
			stdout: 'pipe',
			stderr: 'pipe',
		})
		const stdout = await new Response(proc.stdout).text()
		if ((await proc.exited) !== 0) return false
		// The first line is e.g. `solar 0.3.0+commit.e7a91fc7`.
		const match = /^solar (\S+)\+commit\.([0-9a-f]+)$/.exec(
			stdout.split('\n')[0]?.trim() ?? '',
		)
		return (
			match?.[1] === version.solarVersion &&
			(match[2]?.startsWith(version.commit) ?? false)
		)
	} catch {
		return false
	}
}

/** Returns one regular file of a .tar.gz archive (ustar, as solar's release archives are). */
export function extractFileFromTarGz(
	archive: Uint8Array,
	filePath: string,
): Uint8Array | undefined {
	const tar = gunzipSync(archive)
	const decoder = new TextDecoder()
	const readString = (start: number, length: number) => {
		const field = tar.subarray(start, start + length)
		const end = field.indexOf(0)
		return decoder.decode(end === -1 ? field : field.subarray(0, end))
	}
	let offset = 0
	while (offset + 512 <= tar.length) {
		const header = tar.subarray(offset, offset + 512)
		// Two empty blocks end the archive.
		if (header.every((byte) => byte === 0)) break
		const name = readString(offset, 100)
		const prefix = readString(offset + 345, 155)
		const size = Number.parseInt(readString(offset + 124, 12).trim() || '0', 8)
		const type = String.fromCharCode(header[156] ?? 0)
		const dataStart = offset + 512
		if (
			(type === '0' || type === '\0') &&
			(prefix ? `${prefix}/${name}` : name) === filePath
		)
			return tar.slice(dataStart, dataStart + size)
		offset = dataStart + Math.ceil(size / 512) * 512
	}
	return undefined
}
