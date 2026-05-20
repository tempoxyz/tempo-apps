export default {
	fetch() {
		return new Response(
			'<!doctype html><title>Hello World</title><h1>Hello world</h1>',
			{
				headers: {
					'content-type': 'text/html; charset=utf-8',
				},
			},
		)
	},
} satisfies ExportedHandler
