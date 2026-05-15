import { createFileRoute } from '@tanstack/react-router'
import { BenchmarkDashboard } from '#comps/BenchmarkDashboard'
import { fetchAllLatestRuns } from '#lib/server/bench'

export const Route = createFileRoute('/')({
	component: DashboardPage,
	loader: ({ context }) => {
		context.queryClient.ensureQueryData({
			queryKey: ['latestRuns', 'release'],
			queryFn: () => fetchAllLatestRuns({ data: 'release' }),
		})
	},
})

function DashboardPage(): React.JSX.Element {
	return <BenchmarkDashboard feed="release" />
}
