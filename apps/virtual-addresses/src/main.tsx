import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from '#app'
import { wagmiConfig } from '#lib/wagmi'
import './styles.css'

const queryClient = new QueryClient()

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')

createRoot(root).render(
	<React.StrictMode>
		<WagmiProvider config={wagmiConfig}>
			<QueryClientProvider client={queryClient}>
				<App />
			</QueryClientProvider>
		</WagmiProvider>
	</React.StrictMode>,
)
