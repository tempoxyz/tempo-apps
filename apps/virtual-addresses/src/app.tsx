import type * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Header } from '#comps/header'
import { IntroView } from '#comps/intro-view'
import { RegistryView } from '#comps/registry-view'
import { WalkthroughDemo } from '#comps/walkthrough/walkthrough-demo'

const TABS: ReadonlySet<Header.Tab> = new Set([
	'intro',
	'registry',
	'walkthrough',
])

function parseHash(): Header.Tab {
	const raw = window.location.hash.replace('#', '')
	return TABS.has(raw as Header.Tab) ? (raw as Header.Tab) : 'intro'
}

function useHashTab(): [Header.Tab, (tab: Header.Tab) => void] {
	const [tab, setTab] = useState<Header.Tab>(parseHash)

	useEffect(() => {
		const onHash = (): void => setTab(parseHash())
		window.addEventListener('hashchange', onHash)
		return () => window.removeEventListener('hashchange', onHash)
	}, [])

	const navigate = useCallback((next: Header.Tab) => {
		window.location.hash = next
	}, [])

	return [tab, navigate]
}

export function App(): React.JSX.Element {
	const [activeTab, setActiveTab] = useHashTab()

	return (
		<div className="min-h-screen bg-bg">
			<Header activeTab={activeTab} onTabChange={setActiveTab} />
			{activeTab === 'intro' ? (
				<IntroView />
			) : activeTab === 'registry' ? (
				<RegistryView />
			) : (
				<WalkthroughDemo />
			)}
		</div>
	)
}
