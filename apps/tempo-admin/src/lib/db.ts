import { env } from 'cloudflare:workers'

export type Dispensation = {
	id: number
	email: string
	recipient: string
	amount: string
	purpose: string
	tx_hash: string | null
	status: 'pending' | 'confirmed' | 'failed'
	error: string | null
	created_at: string
}

export async function createPendingDispensation(params: {
	email: string
	recipient: string
	amount: string
	purpose: string
}): Promise<Dispensation> {
	const result = await env.DB.prepare(
		"INSERT INTO faucet_dispensations (email, recipient, amount, purpose, status) VALUES (?, ?, ?, ?, 'pending') RETURNING *",
	)
		.bind(params.email, params.recipient, params.amount, params.purpose)
		.first<Dispensation>()

	if (!result) {
		throw new Error('Failed to create dispensation record')
	}

	return result
}

export async function confirmDispensation(
	id: number,
	txHash: string,
): Promise<void> {
	await env.DB.prepare(
		"UPDATE faucet_dispensations SET tx_hash = ?, status = 'confirmed' WHERE id = ?",
	)
		.bind(txHash, id)
		.run()
}

export async function failDispensation(
	id: number,
	error: string,
): Promise<void> {
	await env.DB.prepare(
		"UPDATE faucet_dispensations SET status = 'failed', error = ? WHERE id = ?",
	)
		.bind(error, id)
		.run()
}

export async function getDailyTotal(email: string): Promise<number> {
	const result = await env.DB.prepare(
		"SELECT COALESCE(SUM(CAST(amount AS REAL)), 0) as total FROM faucet_dispensations WHERE email = ? AND status = 'confirmed' AND created_at >= datetime('now', '-1 day')",
	)
		.bind(email)
		.first<{ total: number }>()

	return result?.total ?? 0
}

export async function getDispensations(params?: {
	email?: string | undefined
	limit?: number | undefined
	offset?: number | undefined
}): Promise<Dispensation[]> {
	const limit = params?.limit ?? 50
	const offset = params?.offset ?? 0

	if (params?.email) {
		const { results } = await env.DB.prepare(
			'SELECT * FROM faucet_dispensations WHERE email = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
		)
			.bind(params.email, limit, offset)
			.all<Dispensation>()

		return results
	}

	const { results } = await env.DB.prepare(
		'SELECT * FROM faucet_dispensations ORDER BY created_at DESC LIMIT ? OFFSET ?',
	)
		.bind(limit, offset)
		.all<Dispensation>()

	return results
}
