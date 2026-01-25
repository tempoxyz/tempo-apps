import { with402 } from '@tempo/402-server'
import { NextResponse } from 'next/server'

/**
 * Next.js Route Handler protected by 402 Settlement.
 */
export const GET = with402(
	{
		recipient: process.env.TEMPO_RECIPIENT!,
		amount: '50000', // 0.05 USD
		rpcUrl: process.env.TEMPO_RPC_URL!,
	},
	async (_request) => {
		return NextResponse.json({
			message: 'This data was paid for autonomously.',
			secret: 'Institutional Pragmatism',
			timestamp: new Date().toISOString(),
		})
	},
)
