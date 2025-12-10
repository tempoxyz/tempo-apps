import { createFileRoute } from '@tanstack/react-router'

const SENTRY_INGEST_HOST = 'o4510467689218048.ingest.us.sentry.io'
const ALLOWED_PROJECT_IDS = new Set(['4510467689218048'])

export const Route = createFileRoute('/api/tunnel')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const body = await request.text()

					const [headerLine] = body.split('\n')
					if (!headerLine)
						return new Response('Invalid envelope: missing header', {
							status: 400,
						})

					let envelope: { dsn?: string }
					try {
						envelope = JSON.parse(headerLine) as { dsn?: string }
					} catch {
						return new Response('Invalid envelope: malformed header', {
							status: 400,
						})
					}

					const dsn = envelope.dsn
					if (!dsn)
						return new Response('Invalid envelope: missing DSN', {
							status: 400,
						})

					const dsnUrl = new URL(dsn)
					const projectId = dsnUrl.pathname.replace('/', '')

					if (!ALLOWED_PROJECT_IDS.has(projectId))
						return new Response('Invalid project ID', { status: 400 })

					const sentryIngestUrl = `https://${SENTRY_INGEST_HOST}/api/${projectId}/envelope/`

					const response = await fetch(sentryIngestUrl, {
						method: 'POST',
						headers: { 'Content-Type': 'application/x-sentry-envelope' },
						body,
					})

					return new Response(response.body, {
						status: response.status,
						headers: {
							'Content-Type':
								response.headers.get('Content-Type') || 'application/json',
						},
					})
				} catch (error) {
					console.error(error)
					return new Response(
						`Internal server error: ${error instanceof Error ? error.message : String(error)}`,
						{ status: 500 },
					)
				}
			},
		},
	},
})
