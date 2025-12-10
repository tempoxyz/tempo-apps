import * as Bun from 'bun'

const headers = new Headers({
	'X-Request-Id': Bun.randomUUIDv7(),
})

const server = Bun.serve({
	port: 80_80,
	development: Bun.env.NODE_ENV === 'development',
	routes: {
		'/health': new Response('ok'),
		'/version': {
			GET: async (_) => {
				const version = await Bun.$ /*sh*/`solc --version`.nothrow().text()
				return Response.json({ solc: version })
			},
		},
		'/compile': {
			POST: async (request, _server) => {
				const body = await request.json<{ input: object }>()
				if (!Object.hasOwn(body, 'input'))
					return Response.json({ error: 'Missing input' }, { status: 400 })

				// solc --standard-json reads from stdin
				const proc = Bun.spawn(['solc', '--standard-json'], {
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
	},
	error: (error) => {
		console.error(JSON.stringify(error, undefined, 2))
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error'
		return new Response(errorMessage, { status: 500, headers })
	},
})

if (Bun.env.ENVIRONMENT === 'development')
	console.info(`Server is running on http://${server.url}:${server.port}`)
else console.info(`Server started on port ${server.port}`)
