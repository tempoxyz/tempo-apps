# @tempo/llms

Renders `llms.txt` and `llms-full.txt` from the zod schemas an app's routes already parse, merged with hand-written descriptions and Markdown templates.

- `render({ docs, routes, templates })` fills each template's `{{pages}}`, `{{api}}`, `{{pageIndex}}`, and `{{apiIndex}}` sections. It throws when a route or parameter is undocumented, a doc names one that does not exist, or a path in the output does not match a documented route.
- `api(schema, doc)` documents an API route by the schema its handler parses.
- `llmsResponder(build)` serves the rendered files, built once per isolate.
- `@tempo/llms/tanstack` reads routes from a TanStack Router instance, and `TanStackDocs<FileRoutesByFullPath>` makes type checking fail on undocumented routes and params.
- `@tempo/llms/hono` reads routes from a Hono app's `app.routes`, and `HonoDocs<typeof app>` makes type checking fail on undocumented routes, or a route whose validated query or body is not documented by `api()` with a schema of the same keys. Hono only types routes registered by chaining.

See `apps/explorer/src/lib/llms` (TanStack) and `apps/fee-payer/src/lib/llms` (Hono) for complete setups.
