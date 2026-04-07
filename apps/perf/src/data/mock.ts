export type Scenario = {
	id: string
	label: string
	workload: string
	validators: number
	targetThroughput: string
}

export type BenchBlock = {
	number: number
	gasUsed: number
	txCount: number
	executionTimeMs: number
	timestamp: number
}

export type BenchRun = {
	id: string
	scenarioId: string
	commit: string
	timestamp: string
	avgTps: number
	avgGasPerSecond: number
	peakGasPerSecond: number
	avgBlockTimeMs: number
	p50LatencyMs: number
	p99LatencyMs: number
	blocks: Array<BenchBlock>
}

function generateBlocks(count: number, baseGas: number): Array<BenchBlock> {
	const blocks: Array<BenchBlock> = []
	const now = Date.now()
	for (let i = 0; i < count; i++) {
		const jitter = 0.8 + Math.random() * 0.4
		const gasUsed = Math.round(baseGas * jitter)
		blocks.push({
			number: 1000 + i,
			gasUsed,
			txCount: Math.round(gasUsed / 21_000),
			executionTimeMs: Math.round(50 + Math.random() * 100),
			timestamp: now - (count - i) * 2000,
		})
	}
	return blocks
}

export const scenarios: Array<Scenario> = [
	{
		id: 'tip20-10v',
		label: '10 Validators — TIP-20 Mix',
		workload: '60% TIP-20 / 20% MPP / 20% DEX',
		validators: 10,
		targetThroughput: '2 Ggas/s',
	},
	{
		id: 'tip20-20v',
		label: '20 Validators — TIP-20 Mix',
		workload: '60% TIP-20 / 20% MPP / 20% DEX',
		validators: 20,
		targetThroughput: '2 Ggas/s',
	},
	{
		id: 'transfer-10v',
		label: '10 Validators — Native Transfers',
		workload: '100% Native Transfers',
		validators: 10,
		targetThroughput: '5 Ggas/s',
	},
]

export const runs: Array<BenchRun> = [
	{
		id: 'run-001',
		scenarioId: 'tip20-10v',
		commit: 'a1b2c3d',
		timestamp: '2026-03-28T14:00:00Z',
		avgTps: 12_450,
		avgGasPerSecond: 1_980_000_000,
		peakGasPerSecond: 2_340_000_000,
		avgBlockTimeMs: 500,
		p50LatencyMs: 48,
		p99LatencyMs: 210,
		blocks: generateBlocks(60, 990_000_000),
	},
	{
		id: 'run-002',
		scenarioId: 'tip20-10v',
		commit: 'e5f6g7h',
		timestamp: '2026-03-30T10:00:00Z',
		avgTps: 13_100,
		avgGasPerSecond: 2_050_000_000,
		peakGasPerSecond: 2_500_000_000,
		avgBlockTimeMs: 500,
		p50LatencyMs: 42,
		p99LatencyMs: 185,
		blocks: generateBlocks(60, 1_025_000_000),
	},
	{
		id: 'run-003',
		scenarioId: 'tip20-20v',
		commit: 'e5f6g7h',
		timestamp: '2026-03-30T10:00:00Z',
		avgTps: 11_200,
		avgGasPerSecond: 1_820_000_000,
		peakGasPerSecond: 2_100_000_000,
		avgBlockTimeMs: 500,
		p50LatencyMs: 55,
		p99LatencyMs: 240,
		blocks: generateBlocks(60, 910_000_000),
	},
	{
		id: 'run-004',
		scenarioId: 'transfer-10v',
		commit: 'e5f6g7h',
		timestamp: '2026-03-30T10:00:00Z',
		avgTps: 42_000,
		avgGasPerSecond: 4_800_000_000,
		peakGasPerSecond: 5_200_000_000,
		avgBlockTimeMs: 500,
		p50LatencyMs: 22,
		p99LatencyMs: 95,
		blocks: generateBlocks(60, 2_400_000_000),
	},
]

export function getScenario(id: string): Scenario | undefined {
	return scenarios.find((s) => s.id === id)
}

export function getRunsForScenario(scenarioId: string): Array<BenchRun> {
	return runs.filter((r) => r.scenarioId === scenarioId)
}

export function getLatestRun(scenarioId: string): BenchRun | undefined {
	const scenarioRuns = getRunsForScenario(scenarioId)
	return scenarioRuns.at(-1)
}

export function getRun(id: string): BenchRun | undefined {
	return runs.find((r) => r.id === id)
}
