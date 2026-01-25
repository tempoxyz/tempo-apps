import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TempoPaymentTool } from '../packages/sdk/src/tool'
import { SilentLogger } from '@tempo/402-common'

// Mock Agent
vi.mock('../packages/sdk/src/agent')

describe('TempoPaymentTool', () => {
	const mockConfig = {
		privateKey:
			'0x1234567890123456789012345678901234567890123456789012345678901234',
		rpcUrl: 'http://localhost:8545',
		logger: new SilentLogger(),
	}

	let tool: TempoPaymentTool
	let mockAgentRequest: ReturnType<typeof vi.fn>

	beforeEach(() => {
		vi.clearAllMocks()
		tool = new TempoPaymentTool(mockConfig)
		// Access the private agent instance to mock its request method
		// @ts-expect-error
		mockAgentRequest = tool.agent.request = vi.fn() as any
	})

	it('should have correct name and description', () => {
		expect(tool.name).toBe('pay_request')
		expect(tool.description).toContain('Make a paid HTTP request')
	})

	it('should return correct schema', () => {
		const schema = tool.schema
		expect(schema.name).toBe('pay_request')
		expect(schema.parameters.type).toBe('object')
		expect(schema.parameters.required).toContain('url')
	})

	it('should execute request successfully', async () => {
		mockAgentRequest.mockResolvedValue({
			status: 200,
			data: { success: true },
		})

		const result = await tool.execute({ url: 'http://test.com' })

		expect(result.success).toBe(true)
		expect(result.output).toEqual({ success: true })
		expect(mockAgentRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				url: 'http://test.com',
				method: 'GET',
			}),
		)
	})

	it('should handle errors gracefully', async () => {
		mockAgentRequest.mockRejectedValue(new Error('Payment failed'))

		const result = await tool.execute({ url: 'http://test.com' })

		expect(result.success).toBe(false)
		expect(result.error).toBe('Payment failed')
	})
})
