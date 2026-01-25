import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Agentic Layer Environment Doctor
 * Verifies prerequisites and project health.
 */

const colors = {
	reset: '\x1b[0m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	cyan: '\x1b[36m',
}

interface CheckResult {
	name: string
	success: boolean
	message: string
	suggestion?: string
}

const checks: CheckResult[] = []

function check(
	name: string,
	fn: () => { success: boolean; message: string; suggestion?: string },
) {
	console.log(`${colors.cyan}Checking ${name}...${colors.reset}`)
	const result = { name, ...fn() }
	checks.push(result)
	if (result.success) {
		console.log(`${colors.green}  ✓ ${result.message}${colors.reset}`)
	} else {
		console.log(`${colors.red}  ✗ ${result.message}${colors.reset}`)
		if (result.suggestion) {
			console.log(
				`${colors.yellow}    Suggestion: ${result.suggestion}${colors.reset}`,
			)
		}
	}
}

console.log(
	`\n${colors.cyan}--- Tempo Agentic Layer Doctor ---${colors.reset}\n`,
)

// 1. Node.js Version
check('Node.js Version', () => {
	const version = process.version
	const major = parseInt(version.slice(1).split('.')[0], 10)
	const isOk = major >= 20
	return {
		success: isOk,
		message: `Currently using Node.js ${version}`,
		suggestion: isOk ? undefined : 'Please upgrade to Node.js 20 or higher.',
	}
})

// 2. Package Manager
check('Package Manager (pnpm)', () => {
	try {
		const version = execSync('pnpm -v', { stdio: 'pipe' }).toString().trim()
		return {
			success: true,
			message: `pnpm version ${version} detected`,
		}
	} catch {
		// Windows specific fallback check
		const roamingPnpm = join(process.env.APPDATA || '', 'npm', 'pnpm.cmd')
		if (existsSync(roamingPnpm)) {
			return {
				success: true,
				message: `pnpm detected at ${roamingPnpm} (via AppData)`,
			}
		}

		return {
			success: false,
			message: 'pnpm is not installed or not in PATH',
			suggestion: "Install pnpm using 'npm install -g pnpm'",
		}
	}
})

// 3. Workspace Root (Alignment)
check('Monorepo Context', () => {
	const deepRoot = join(process.cwd(), '..', '..', 'package.json')
	if (existsSync(deepRoot)) {
		return {
			success: true,
			message: 'Detected running inside tempo-apps monorepo',
		}
	}
	return {
		success: false,
		message: 'Not detected inside the parent monorepo structure',
		suggestion:
			'Ensure this app is located in <tempo-apps>/apps/agentic-layer for workspace support.',
	}
})

// Summary
const total = checks.length
const passed = checks.filter((c) => c.success).length

console.log(`\n${colors.cyan}--- Dashboard ---${colors.reset}`)
console.log(`${passed}/${total} checks passed.\n`)

if (passed === total) {
	console.log(
		`${colors.green}Your environment is ready for development!${colors.reset}\n`,
	)
	process.exit(0)
} else {
	console.log(
		`${colors.red}Found environment issues. Please resolve the suggestions above.${colors.reset}\n`,
	)
	process.exit(1)
}
