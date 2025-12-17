import * as Bun from 'bun'

import { getSolcPath, getVyperPath } from './compiler.ts'

const headers = new Headers({
	'X-Request-Id': Bun.randomUUIDv7(),
})

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
		'/compile/vyper': {
			POST: async (request, server) => {
				const address = server.requestIP(request as Request)
				if (address)
					console.info(
						`[/compile/vyper] request IP address: ${address.address}:${address.port}`,
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

				const vyperPath = await getVyperPath(body.compilerVersion)

				// vyper --standard-json reads from stdin
				const proc = Bun.spawn([vyperPath, '--standard-json'], {
					stdin: new TextEncoder().encode(JSON.stringify(body.input)),
					stdout: 'pipe',
					stderr: 'pipe',
				})

				const stdout = await new Response(proc.stdout).text()
				const stderr = await new Response(proc.stderr).text()
				await proc.exited

				// Vyper < 0.4.0 outputs warnings to stderr, so only log if it looks like an error
				if (stderr && !stderr.includes('Warning'))
					console.error('[compile/vyper] stderr:', stderr)

				if (!stdout)
					return Response.json(
						{ error: 'Failed to compile', stderr },
						{ status: 500 },
					)

				try {
					const output = JSON.parse(stdout)
					return Response.json(output, { status: 200 })
				} catch (error) {
					console.error('[compile/vyper] Failed to parse vyper output:', error)
					return Response.json(
						{ error: 'Failed to parse vyper output', stdout, stderr },
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
