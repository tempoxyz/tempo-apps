import * as React from 'react'

export type ActivityType =
	| 'send'
	| 'received'
	| 'swap'
	| 'mint'
	| 'burn'
	| 'approve'
	| 'unknown'

export interface ActivitySummary {
	types: ActivityType[]
	typeCounts: Record<ActivityType, number>
	count: number
	recentTimestamp?: number
}

const ActivityContext = React.createContext<{
	summary: ActivitySummary | null
	setSummary: (summary: ActivitySummary | null) => void
}>({
	summary: null,
	setSummary: () => {},
})

export function ActivityProvider({ children }: { children: React.ReactNode }) {
	const [summary, setSummary] = React.useState<ActivitySummary | null>(null)

	const value = React.useMemo(() => ({ summary, setSummary }), [summary])

	return (
		<ActivityContext.Provider value={value}>
			{children}
		</ActivityContext.Provider>
	)
}

export function useActivitySummary() {
	return React.useContext(ActivityContext)
}
