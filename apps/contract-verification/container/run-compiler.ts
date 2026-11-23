import * as Bun from 'bun'

function positiveInt(value: string | undefined, fallback: number): number {
	const parsed = Number(value)
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

/** Wall-clock limit for one compiler process; it is killed when the limit is reached. */
export const COMPILE_TIMEOUT_MS = positiveInt(
	Bun.env.COMPILE_TIMEOUT_MS,
	5 * 60 * 1_000,
)

/** Compiler processes one instance runs at once; requests beyond it are refused with 503. */
export const MAX_CONCURRENT_COMPILES = positiveInt(
	Bun.env.MAX_CONCURRENT_COMPILES,
	4,
)

let activeCompiles = 0

export function getActiveCompiles(): number {
	return activeCompiles
}

export type CompileResult =
	| { kind: 'busy' }
	| { kind: 'timeout' }
	| { kind: 'aborted' }
	| { kind: 'done'; stdout: string; stderr: string }

/**
 * Run a compiler with `--standard-json`, feeding `input` on stdin.
 *
 * The child is killed with SIGKILL when it runs past `COMPILE_TIMEOUT_MS` or when `signal`
 * aborts (the caller disconnected), and at most `MAX_CONCURRENT_COMPILES` run at once.
 * stdout and stderr are drained together so a full stderr pipe cannot stall the child.
 */
export async function runCompiler(options: {
	command: string[]
	env?: Record<string, string | undefined> | undefined
	input: object
	signal: AbortSignal
}): Promise<CompileResult> {
	if (activeCompiles >= MAX_CONCURRENT_COMPILES) return { kind: 'busy' }
	if (options.signal.aborted) return { kind: 'aborted' }

	activeCompiles++
	try {
		const deadline = AbortSignal.timeout(COMPILE_TIMEOUT_MS)
		const proc = Bun.spawn(options.command, {
			env: options.env,
			stdin: new TextEncoder().encode(JSON.stringify(options.input)),
			stdout: 'pipe',
			stderr: 'pipe',
			signal: AbortSignal.any([options.signal, deadline]),
			killSignal: 'SIGKILL',
		})

		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		])
		await proc.exited

		if (deadline.aborted) return { kind: 'timeout' }
		if (options.signal.aborted) return { kind: 'aborted' }
		return { kind: 'done', stdout, stderr }
	} finally {
		activeCompiles--
	}
}

/** The response for a compile that did not produce output. */
export function compileFailureResponse(
	result: Exclude<CompileResult, { kind: 'done' }>,
): Response {
	switch (result.kind) {
		case 'busy':
			return Response.json(
				{ error: 'Too many compilations in progress' },
				{ status: 503, headers: { 'Retry-After': '5' } },
			)
		case 'timeout':
			return Response.json(
				{ error: `Compilation timed out after ${COMPILE_TIMEOUT_MS / 1000}s` },
				{ status: 504 },
			)
		case 'aborted':
			return Response.json({ error: 'Request aborted' }, { status: 499 })
	}
}
