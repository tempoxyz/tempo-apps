import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { fetchLatestRun, fetchRunsForScenario } from '#lib/server/bench'
import { BenchmarkRunDetail } from '#routes/benchmark.$id'

export const Route = createFileRoute('/')({
	component: DashboardPage,
	loader: async ({ context }) => {
		const latestRun = await context.queryClient.ensureQueryData({
			queryKey: ['latestRun', 'release'],
			queryFn: () => fetchLatestRun({ data: 'release' }),
		})

		if (!latestRun) return

		context.queryClient.setQueryData(['run', latestRun.id], latestRun)

		if (latestRun.scenarioId) {
			await context.queryClient.ensureQueryData({
				queryKey: ['scenarioRuns', latestRun.scenarioId, 'release'],
				queryFn: () =>
					fetchRunsForScenario({
						data: { scenarioId: latestRun.scenarioId, feed: 'release' },
					}),
			})
		}
	},
})

function DashboardPage(): React.JSX.Element {
	const { data: latestRun } = useSuspenseQuery({
		queryKey: ['latestRun', 'release'],
		queryFn: () => fetchLatestRun({ data: 'release' }),
	})

	if (!latestRun) {
		return (
			<div className="py-20 text-center text-secondary">
				No release benchmarks found.
			</div>
		)
	}

	return <BenchmarkRunDetail id={latestRun.id} />
}
