import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import * as React from 'react'
import {
	fetchReleaseRuns,
	fetchRunsForScenario,
	getScenarios,
	type BenchRun,
	type Scenario,
} from '#lib/server/bench'
import { BenchmarkRunDetail } from '#routes/benchmark.$id'

type DashboardSearch = {
	release?: string | undefined
	scenario?: string | undefined
}

export const Route = createFileRoute('/')({
	component: DashboardPage,
	validateSearch: (search: Record<string, unknown>): DashboardSearch => ({
		release: optionalSearchString(search.release),
		scenario: optionalSearchString(search.scenario),
	}),
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps }) => {
		const releaseRuns = await context.queryClient.ensureQueryData({
			queryKey: ['releaseRuns'],
			queryFn: () => fetchReleaseRuns(),
		})

		const selected = selectBenchmarkRun(releaseRuns, deps)
		const selectedRun = selected.run
		if (!selectedRun) return

		context.queryClient.setQueryData(['run', selectedRun.id], selectedRun)

		if (selectedRun.scenarioId) {
			await context.queryClient.ensureQueryData({
				queryKey: ['scenarioRuns', selectedRun.scenarioId],
				queryFn: () =>
					fetchRunsForScenario({
						data: { scenarioId: selectedRun.scenarioId },
					}),
			})
		}
	},
})

function DashboardPage(): React.JSX.Element {
	const navigate = useNavigate()
	const search = Route.useSearch()
	const scenarios = getScenarios()
	const { data: releaseRuns } = useSuspenseQuery({
		queryKey: ['releaseRuns'],
		queryFn: () => fetchReleaseRuns(),
	})

	const releaseOptions = React.useMemo(
		() => getReleaseOptions(releaseRuns),
		[releaseRuns],
	)
	const selected = selectBenchmarkRun(releaseRuns, search)

	if (!selected.run || !selected.release) {
		return (
			<div className="py-20 text-center text-secondary">
				No release benchmarks found.
			</div>
		)
	}

	const scenarioOptions = getScenarioOptions(selected.runsForRelease, scenarios)

	function setRelease(release: string) {
		const nextRuns = getRunsForRelease(releaseRuns, release)
		const nextScenario = nextRuns.some(
			(run) => run.scenarioId === selected.scenario,
		)
			? selected.scenario
			: nextRuns[0]?.scenarioId

		navigate({
			to: '/',
			search: { release, scenario: nextScenario },
			resetScroll: false,
		})
	}

	function setScenario(scenario: string) {
		navigate({
			to: '/',
			search: { release: selected.release, scenario },
			resetScroll: false,
		})
	}

	return (
		<BenchmarkRunDetail
			id={selected.run.id}
			headerControls={
				<BenchmarkSelectors
					releases={releaseOptions}
					scenarios={scenarioOptions}
					selectedRelease={selected.release}
					selectedScenario={selected.scenario}
					onReleaseChange={setRelease}
					onScenarioChange={setScenario}
				/>
			}
		/>
	)
}

function optionalSearchString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined
}

function isTagRef(ref: string): boolean {
	return ref.startsWith('v')
}

function isCommitRef(ref: string): boolean {
	return /^[0-9a-f]{7,40}$/i.test(ref)
}

function getReleaseKey(run: BenchRun): string {
	if (run.commit) return run.commit
	if (run.ref && isCommitRef(run.ref)) return run.ref.slice(0, 7)
	return run.ref || run.id
}

function getReleaseLabel(run: BenchRun): string {
	if (run.ref && isTagRef(run.ref)) return run.ref
	if (run.ref && !isCommitRef(run.ref)) return run.ref
	return run.commit || run.ref || run.id
}

function shouldReplaceReleaseLabel(current: string, next: string): boolean {
	if (isTagRef(current)) return false
	if (isTagRef(next)) return true
	return isCommitRef(current) && !isCommitRef(next)
}

type ReleaseOption = {
	value: string
	label: string
	startedAt: string
}

function getReleaseOptions(runs: Array<BenchRun>): Array<ReleaseOption> {
	const releases = new Map<string, ReleaseOption>()

	for (const run of runs) {
		const value = getReleaseKey(run)
		const label = getReleaseLabel(run)
		const current = releases.get(value)

		if (!current) {
			releases.set(value, { value, label, startedAt: run.startedAt })
			continue
		}

		releases.set(value, {
			value,
			label: shouldReplaceReleaseLabel(current.label, label)
				? label
				: current.label,
			startedAt:
				new Date(run.startedAt) > new Date(current.startedAt)
					? run.startedAt
					: current.startedAt,
		})
	}

	return Array.from(releases.values()).sort(
		(a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
	)
}

function getRunsForRelease(
	runs: Array<BenchRun>,
	release: string,
): Array<BenchRun> {
	return runs
		.filter((run) => getReleaseKey(run) === release)
		.sort(
			(a, b) =>
				new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
		)
}

function selectBenchmarkRun(
	runs: Array<BenchRun>,
	search: DashboardSearch,
): {
	release: string | undefined
	scenario: string | undefined
	run: BenchRun | undefined
	runsForRelease: Array<BenchRun>
} {
	const releaseOptions = getReleaseOptions(runs)
	const selectedRelease = releaseOptions.find(
		(option) =>
			option.value === search.release || option.label === search.release,
	)
	const release = selectedRelease?.value ?? releaseOptions[0]?.value
	if (!release) {
		return {
			release: undefined,
			scenario: undefined,
			run: undefined,
			runsForRelease: [],
		}
	}

	const runsForRelease = getRunsForRelease(runs, release)
	const scenario = runsForRelease.some(
		(run) => run.scenarioId === search.scenario,
	)
		? search.scenario
		: runsForRelease[0]?.scenarioId

	return {
		release,
		scenario,
		run: runsForRelease.find((run) => run.scenarioId === scenario),
		runsForRelease,
	}
}

function getScenarioOptions(
	runsForRelease: Array<BenchRun>,
	scenarios: Array<Scenario>,
): Array<Scenario> {
	const availableScenarioIds = new Set(
		runsForRelease.map((run) => run.scenarioId),
	)
	const knownScenarios = scenarios.filter((scenario) =>
		availableScenarioIds.has(scenario.id),
	)
	const knownScenarioIds = new Set(
		knownScenarios.map((scenario) => scenario.id),
	)
	const unknownScenarios = runsForRelease
		.filter((run) => !knownScenarioIds.has(run.scenarioId))
		.map((run) => ({
			id: run.scenarioId,
			label: run.scenarioId,
			workload: run.scenarioId,
		}))

	return [...knownScenarios, ...unknownScenarios]
}

function BenchmarkSelectors(props: {
	releases: Array<ReleaseOption>
	scenarios: Array<Scenario>
	selectedRelease: string
	selectedScenario: string | undefined
	onReleaseChange: (release: string) => void
	onScenarioChange: (scenario: string) => void
}): React.JSX.Element {
	return (
		<div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
			<label className="flex flex-col gap-1">
				<span className="text-[11px] font-normal uppercase tracking-wider text-tertiary">
					Release
				</span>
				<select
					value={props.selectedRelease}
					onChange={(event) => props.onReleaseChange(event.currentTarget.value)}
					className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-[13px] text-primary outline-none transition-colors hover:border-accent/50 focus:border-accent sm:w-40"
				>
					{props.releases.map((release) => (
						<option key={release.value} value={release.value}>
							{release.label}
						</option>
					))}
				</select>
			</label>
			<label className="flex flex-col gap-1">
				<span className="text-[11px] font-normal uppercase tracking-wider text-tertiary">
					Scenario
				</span>
				<select
					value={props.selectedScenario ?? ''}
					onChange={(event) =>
						props.onScenarioChange(event.currentTarget.value)
					}
					className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-primary outline-none transition-colors hover:border-accent/50 focus:border-accent sm:w-48"
				>
					{props.scenarios.map((scenario) => (
						<option key={scenario.id} value={scenario.id}>
							{scenario.label}
						</option>
					))}
				</select>
			</label>
		</div>
	)
}
