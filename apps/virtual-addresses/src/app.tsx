import type * as React from 'react'
import { useState } from 'react'
import { Header } from '#comps/header'
import { RegistryView } from '#comps/registry-view'
import { WalkthroughDemo } from '#comps/walkthrough/walkthrough-demo'

export function App(): React.JSX.Element {
	const [activeTab, setActiveTab] = useState<Header.Tab>('registry')

	return (
		<div className="min-h-screen bg-bg">
			<Header activeTab={activeTab} onTabChange={setActiveTab} />
			{activeTab === 'registry' ? <RegistryView /> : <WalkthroughDemo />}
		</div>
	)
}
