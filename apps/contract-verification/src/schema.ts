import * as z from 'zod/mini'
import { Address, Hex } from 'ox'

import { chainIds } from '#wagmi.config.ts'

export const zAddress = (options: { strict?: boolean } = {}) =>
	z.string().check((ctx) => {
		if (!Address.validate(ctx.value, options)) {
			ctx.issues.push({
				code: 'custom',
				input: ctx.value,
				message: 'Invalid address',
			})
		}
	})

export const zHash = (options: { strict?: boolean } = {}) =>
	z.string().check((ctx) => {
		if (!Hex.validate(ctx.value, options) || Hex.size(ctx.value) !== 32) {
			ctx.issues.push({
				code: 'custom',
				input: ctx.value,
				message: 'Invalid hash length',
			})
		}
	})

export const zChainId = () =>
	z.coerce.number().check((ctx) => {
		if (!chainIds.includes(ctx.value)) {
			ctx.issues.push({
				code: 'custom',
				input: ctx.value,
				message: 'Unsupported chain ID',
			})
		}
	})

export const StdJsonInput = z.object({
	language: z.string(),
	settings: z.record(z.string(), z.any()),
	sources: z.record(z.string(), z.object({ content: z.string() })),
})

export type StdJsonInput = z.infer<typeof StdJsonInput>

export const VerificationJob = z.object({
	jobId: z.uuidv4(),
	chainId: zChainId(),
	stdJsonInput: StdJsonInput,
	compilerVersion: z.string(),
	contractIdentifier: z.string(),
	address: zAddress({ strict: false }),
	creationTransactionHash: z.optional(zHash()),
})

export type VerificationJob = z.infer<typeof VerificationJob>

type AbiParameter = {
	name?: string | undefined
	type: string
	components?: Array<AbiParameter> | undefined
}

type AbiItem = {
	type: string
	name?: string | undefined
	inputs?: Array<AbiParameter> | undefined
}

const AbiParameter: z.ZodMiniType<AbiParameter> = z.object({
	name: z.optional(z.string()),
	type: z.string(),
	components: z.optional(
		z.array(z.lazy((): z.ZodMiniType<AbiParameter> => AbiParameter)),
	),
})

const Abi: z.ZodMiniType<AbiItem> = z.object({
	type: z.string(),
	name: z.optional(z.string()),
	inputs: z.optional(z.array(AbiParameter)),
})

export const LinkReference = z.object({
	start: z.number(),
	length: z.number(),
})
export const LinkReferences = z.record(
	z.string(),
	z.record(z.string(), z.array(LinkReference)),
)
export type LinkReference = z.infer<typeof LinkReference>
export type LinkReferences = z.infer<typeof LinkReferences>

export const ImmutableReference = z.object({
	start: z.number(),
	length: z.number(),
})
export const ImmutableReferences = z.record(
	z.string(),
	z.array(ImmutableReference),
)
export type ImmutableReference = z.infer<typeof ImmutableReference>
export type ImmutableReferences = z.infer<typeof ImmutableReferences>

export const Contract = z.object({
	abi: z.array(Abi),
	evm: z.object({
		bytecode: z.object({
			object: z.string(),
			sourceMap: z.optional(z.string()),
			linkReferences: z.optional(z.record(z.string(), z.array(LinkReference))),
		}),
		deployedBytecode: z.object({
			object: z.string(),
			sourceMap: z.optional(z.string()),
			linkReferences: z.optional(LinkReferences),
			immutableReferences: z.optional(ImmutableReferences),
		}),
	}),
	devdoc: z.optional(z.unknown()),
	userdoc: z.optional(z.unknown()),
	metadata: z.optional(z.string()),
	storageLayout: z.optional(z.unknown()),
})

export type Contract = z.infer<typeof Contract>

export const CompileOutput = z.object({
	contracts: z.record(z.string(), z.record(z.string(), Contract)),
	errors: z.optional(
		z.array(
			z.object({
				message: z.string(),
				severity: z.string(),
				formattedMessage: z.optional(z.string()),
			}),
		),
	),
})

export type CompileOutput = z.infer<typeof CompileOutput>
