import { Agent } from './agent'
import type { TempoAgentConfig } from './types'

/**
 * Standardized Tool Interface for Agentic Frameworks
 * Compatible with OpenAI, Anthropic, and other agentic patterns.
 */
export interface ToolSchema {
	name: string
	description: string
	parameters: Record<string, unknown>
}

export interface ToolResult {
	success: boolean
	output?: unknown
	error?: string
}

/**
 * 402 Payment Tool for Autonomous Agents.
 *
 * Usage:
 * const paymentTool = new TempoPaymentTool(config);
 * const result = await paymentTool.execute({ url: "https://api.example.com/premium" });
 */
export class TempoPaymentTool {
	public readonly name = 'pay_request'
	public readonly description =
		'Make a paid HTTP request that might require 402 payment settlement.'

	private agent: Agent

	constructor(config: TempoAgentConfig) {
		this.agent = new Agent(config)
	}

	public get schema(): ToolSchema {
		return {
			name: this.name,
			description: this.description,
			parameters: {
				type: 'object',
				properties: {
					url: {
						type: 'string',
						description: 'The URL to request data from',
					},
					method: {
						type: 'string',
						enum: ['GET', 'POST', 'PUT', 'DELETE'],
						description: 'HTTP method (default: GET)',
						default: 'GET',
					},
					data: {
						type: 'object',
						description: 'JSON body for POST/PUT requests',
						additionalProperties: true,
					},
				},
				required: ['url'],
			},
		}
	}

	public async execute(args: {
		url: string
		method?: string
		data?: any
	}): Promise<ToolResult> {
		try {
			const response = await this.agent.request({
				url: args.url,
				method: args.method || 'GET',
				data: args.data,
			})

			return {
				success: true,
				output: response.data,
			}
		} catch (error: any) {
			return {
				success: false,
				error: error.message || 'Unknown payment error',
			}
		}
	}
}
