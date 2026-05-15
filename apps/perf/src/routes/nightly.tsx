import { createFileRoute } from '@tanstack/react-router'
import { BenchmarkDashboard } from '#comps/BenchmarkDashboard'
import { fetchAllLatestRuns } from '#lib/server/bench'

export const Route = createFileRoute('/nightly')({
	component: NightlyPage,
	loader: ({ context }) => {
		context.queryClient.ensureQueryData({
			queryKey: ['latestRuns', 'nightly'],
			queryFn: () => fetchAllLatestRuns({ data: 'nightly' }),
		})
	},
})

function NightlyPage(): React.JSX.Element {
	return <BenchmarkDashboard feed="nightly" />
}
