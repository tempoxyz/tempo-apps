import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest'

import { configureLogger, getLogger, withContext } from '#logger.ts'
import {
	AppError,
	formatError,
	handleError,
	normalizeSourcePath,
	sourcifyError,
} from '#utilities.ts'
import type { Context } from 'hono'

const logger = getLogger(['tempo'])

beforeAll(async () => {
	await configureLogger('production', false)
})

describe('normalizeSourcePath', () => {
	it('returns relative paths unchanged', () => {
		expect(normalizeSourcePath('contracts/Token.sol')).toBe(
			'contracts/Token.sol',
		)
		expect(normalizeSourcePath('./src/Main.sol')).toBe('./src/Main.sol')
	})

	it('extracts path after /src/', () => {
		expect(normalizeSourcePath('/home/user/project/src/Token.sol')).toBe(
			'src/Token.sol',
		)
		expect(normalizeSourcePath('/Users/dev/app/src/utils/Helper.sol')).toBe(
			'src/utils/Helper.sol',
		)
	})

	it('extracts path after /contracts/', () => {
		expect(normalizeSourcePath('/home/user/project/contracts/Token.sol')).toBe(
			'contracts/Token.sol',
		)
		expect(
			normalizeSourcePath('/Users/dev/app/contracts/tokens/ERC20.sol'),
		).toBe('contracts/tokens/ERC20.sol')
	})

	it('extracts path after /lib/', () => {
		expect(
			normalizeSourcePath('/home/user/project/lib/forge-std/Test.sol'),
		).toBe('lib/forge-std/Test.sol')
	})

	it('extracts path after /test/', () => {
		expect(normalizeSourcePath('/home/user/project/test/Token.t.sol')).toBe(
			'test/Token.t.sol',
		)
	})

	it('extracts path after /script/', () => {
		expect(normalizeSourcePath('/home/user/project/script/Deploy.s.sol')).toBe(
			'script/Deploy.s.sol',
		)
	})

	it('uses last occurrence of pattern', () => {
		expect(normalizeSourcePath('/src/old/contracts/src/new/Token.sol')).toBe(
			'src/new/Token.sol',
		)
	})

	it('falls back to filename for unknown paths', () => {
		expect(normalizeSourcePath('/unknown/path/to/Token.sol')).toBe('Token.sol')
		expect(normalizeSourcePath('/some/deep/nested/File.sol')).toBe('File.sol')
	})

	it('handles path with only root', () => {
		expect(normalizeSourcePath('/File.sol')).toBe('File.sol')
	})
})

describe('log', () => {
	let consoleInfoSpy: ReturnType<typeof vi.spyOn>
	let consoleWarnSpy: ReturnType<typeof vi.spyOn>
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
		consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('logger.info', () => {
		it('logs info event as JSON', () => {
			logger.info('test_event', { key: 'value' })

			expect(consoleInfoSpy).toHaveBeenCalledOnce()
			const output = JSON.parse(
				consoleInfoSpy?.mock.calls[0]?.[0] as string,
			) as Record<string, unknown>
			expect(output.event).toBe('test_event')
			expect(output.key).toBe('value')
		})

		it('logs without extra data', () => {
			logger.info('simple_event')

			expect(consoleInfoSpy).toHaveBeenCalledOnce()
			const output = JSON.parse(
				consoleInfoSpy?.mock.calls[0]?.[0] as string,
			) as Record<string, unknown>
			expect(output.event).toBe('simple_event')
		})
	})

	describe('logger.warn', () => {
		it('logs warn event as JSON', () => {
			logger.warn('warning_event', { code: 'W001' })

			expect(consoleWarnSpy).toHaveBeenCalledOnce()
			const output = JSON.parse(
				consoleWarnSpy?.mock.calls[0]?.[0] as string,
			) as Record<string, unknown>
			expect(output.event).toBe('warning_event')
			expect(output.code).toBe('W001')
		})
	})

	describe('logger.error', () => {
		it('logs error with Error object', () => {
			const error = new Error('Something went wrong')
			logger.error('error_event', {
				error: formatError(error),
				context: 'test',
			})

			expect(consoleErrorSpy).toHaveBeenCalledOnce()
			const output = JSON.parse(
				consoleErrorSpy?.mock.calls[0]?.[0] as string,
			) as Record<string, unknown>
			const outputError = output.error as Record<string, unknown>
			expect(output.event).toBe('error_event')
			expect(outputError.type).toBe('Error')
			expect(outputError.message).toBe('Something went wrong')
			expect(outputError.stack).toBeDefined()
			expect(output.context).toBe('test')
		})

		it('logs error with string', () => {
			logger.error('error_event', { error: formatError('string error') })

			const output = JSON.parse(
				consoleErrorSpy?.mock.calls[0]?.[0] as string,
			) as Record<string, unknown>
			const outputError = output.error as Record<string, unknown>
			expect(outputError.type).toBe('Unknown')
			expect(outputError.message).toBe('string error')
		})

		it('logs error with custom Error subclass', () => {
			class CustomError extends Error {
				constructor(message: string) {
					super(message)
					this.name = 'CustomError'
				}
			}

			logger.error('custom_error', {
				error: formatError(new CustomError('Custom message')),
			})

			const output = JSON.parse(
				consoleErrorSpy?.mock.calls[0]?.[0] as string,
			) as Record<string, unknown>
			const outputError = output.error as Record<string, unknown>
			expect(outputError.type).toBe('CustomError')
			expect(outputError.message).toBe('Custom message')
		})
	})

	describe('withContext', () => {
		it('includes implicit context in logs', async () => {
			await withContext(
				{ requestId: 'req-123', method: 'POST', path: '/api/verify' },
				() => {
					logger.info('context_event', { extra: 'data' })
				},
			)

			const output = JSON.parse(
				consoleInfoSpy?.mock.calls[0]?.[0] as string,
			) as Record<string, unknown>
			expect(output.event).toBe('context_event')
			expect(output.requestId).toBe('req-123')
			expect(output.method).toBe('POST')
			expect(output.path).toBe('/api/verify')
			expect(output.extra).toBe('data')
		})

		it('logs warn with context', async () => {
			await withContext({ requestId: 'req-456' }, () => {
				logger.warn('context_warn')
			})

			const output = JSON.parse(
				consoleWarnSpy?.mock.calls[0]?.[0] as string,
			) as Record<string, unknown>
			expect(output.requestId).toBe('req-456')
		})

		it('logs error with context', async () => {
			await withContext({ requestId: 'req-789' }, () => {
				logger.error('context_error', {
					error: formatError(new Error('Oops')),
				})
			})

			const output = JSON.parse(
				consoleErrorSpy?.mock.calls[0]?.[0] as string,
			) as Record<string, unknown>
			const outputError = output.error as Record<string, unknown>
			expect(output.requestId).toBe('req-789')
			expect(outputError.message).toBe('Oops')
		})
	})
})

describe('sourcifyError', () => {
	it('returns JSON error response with correct status', () => {
		const mockContext = {
			json: vi.fn((body, status) => ({ body, status })),
		} as unknown as Context

		sourcifyError(mockContext, 400, 'invalid_input', 'Invalid request body')

		expect(mockContext.json).toHaveBeenCalledWith(
			expect.objectContaining({
				message: 'Invalid request body',
				customCode: 'invalid_input',
				errorId: expect.any(String),
			}),
			400,
		)
	})

	it('generates unique errorId each time', () => {
		const ids: string[] = []
		const mockContext = {
			json: vi.fn((body) => {
				ids.push(body.errorId)
				return body
			}),
		} as unknown as Context

		sourcifyError(mockContext, 400, 'test', 'msg')
		sourcifyError(mockContext, 400, 'test', 'msg')

		expect(ids[0]).not.toBe(ids[1])
	})
})

describe('appError', () => {
	it('creates error with all properties', () => {
		const error = new AppError({
			status: 404,
			code: 'not_found',
			message: 'Resource not found',
			context: { resource: 'contract' },
		})

		expect(error.status).toBe(404)
		expect(error.code).toBe('not_found')
		expect(error.message).toBe('Resource not found')
		expect(error.context).toStrictEqual({ resource: 'contract' })
	})

	it('has empty context by default', () => {
		const error = new AppError({
			status: 500,
			code: 'internal',
			message: 'Internal error',
		})

		expect(error.context).toStrictEqual({})
	})

	it('preserves cause', () => {
		const cause = new Error('Original error')
		const error = new AppError({
			status: 500,
			code: 'wrapped',
			message: 'Wrapped error',
			cause,
		})

		expect(error.cause).toBe(cause)
	})

	it('serializes to JSON correctly', () => {
		const error = new AppError({
			status: 400,
			code: 'bad_request',
			message: 'Bad request',
		})

		const json = error.toJSON()

		expect(json.message).toBe('Bad request')
		expect(json.customCode).toBe('bad_request')
		expect(json.errorId).toBeDefined()
	})
})

describe('handleError', () => {
	let consoleWarnSpy: ReturnType<typeof vi.spyOn>
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('handles AppError', async () => {
		const mockContext = {
			get: vi.fn(() => 'req-123'),
			req: { method: 'POST', path: '/verify' },
			json: vi.fn((body, status) => ({ body, status })),
		} as unknown as Context

		const error = new AppError({
			status: 400,
			code: 'invalid_input',
			message: 'Invalid input',
			context: { field: 'address' },
		})

		await withContext({ requestId: 'req-123' }, () => {
			handleError(error, mockContext)
		})

		expect(mockContext.json).toHaveBeenCalledWith(
			expect.objectContaining({
				message: 'Invalid input',
				customCode: 'invalid_input',
			}),
			400,
		)
		expect(consoleWarnSpy).toHaveBeenCalledOnce()
		expect(consoleWarnSpy?.mock.calls[0]?.[0]).toBeTypeOf('string')
		const warnPayload = JSON.parse(
			consoleWarnSpy?.mock.calls[0]?.[0] as string,
		) as Record<string, unknown>
		expect(warnPayload.event).toBe('invalid_input')
		expect(warnPayload.requestId).toBe('req-123')
	})

	it('handles generic Error', async () => {
		const mockContext = {
			get: vi.fn(() => 'req-456'),
			req: { method: 'GET', path: '/lookup' },
			json: vi.fn((body, status) => ({ body, status })),
		} as unknown as Context

		const error = new Error('Unexpected error')

		await withContext({ requestId: 'req-456' }, () => {
			handleError(error, mockContext)
		})

		expect(mockContext.json).toHaveBeenCalledWith(
			expect.objectContaining({
				message: 'An unexpected error occurred',
				customCode: 'internal_error',
			}),
			500,
		)
		expect(consoleErrorSpy).toHaveBeenCalledOnce()
		expect(consoleErrorSpy?.mock.calls[0]?.[0]).toBeTypeOf('string')
		const errorPayload = JSON.parse(
			consoleErrorSpy?.mock.calls[0]?.[0] as string,
		) as Record<string, unknown>
		expect(errorPayload.event).toBe('unhandled_error')
		expect(errorPayload.requestId).toBe('req-456')
	})
})
