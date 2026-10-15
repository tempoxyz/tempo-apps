/**
 * Serves rendered files as plain text, building them on first use and
 * reusing them for the life of the isolate or process.
 */
export function llmsResponder<Name extends string>(
	build: () => Record<Name, string>,
) {
	let files: Record<Name, string> | undefined
	return (name: Name): Response => {
		files ??= build()
		return new Response(files[name], {
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Cache-Control': 'public, max-age=3600',
			},
		})
	}
}
