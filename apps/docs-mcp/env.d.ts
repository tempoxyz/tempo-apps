/// <reference path="./worker-configuration.d.ts" />

// AI Search binding type augmentation.
//
// `ai_search_namespaces` is supported by wrangler at runtime, but the
// runtime types emitted by wrangler 4.79 model only the legacy Account /
// Instance services and omit the new `items` API used for uploading
// documents into built-in storage. The binding type also isn't auto-emitted
// onto the Env interface yet.
//
// When the workspace bumps wrangler (>= 4.96) these augmentations become
// redundant — `wrangler types` will generate the correct shape directly.
declare abstract class AiSearchItems {
	uploadAndPoll(
		name: string,
		content: string | ReadableStream | ArrayBuffer,
		options?: { metadata?: Record<string, unknown>; pollIntervalMs?: number },
	): Promise<{ status: string }>
}

declare interface AiSearchInstanceService {
	readonly items: AiSearchItems
}

declare namespace Cloudflare {
	interface Env {
		AI_SEARCH: AiSearchAccountService
	}
}
