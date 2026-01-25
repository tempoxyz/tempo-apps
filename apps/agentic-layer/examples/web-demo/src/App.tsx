import { useState } from 'react'
import { Agent } from '@tempo/402-sdk'
import { createWalletClient, createPublicClient, custom } from 'viem'
import './index.css'

declare global {
	interface Window {
		ethereum?: any
	}
}

// Constants matching our demo environment
const SERVER_URL = 'http://localhost:3000'
const PROTECTED_ENDPOINT = `${SERVER_URL}/premium-data`

interface Log {
	time: string
	msg: string
	type?: 'info' | 'success' | 'error'
}

function App() {
	const [status, setStatus] = useState<
		'idle' | 'requesting' | 'paying' | 'confirming' | 'success' | 'error'
	>('idle')
	const [data, setData] = useState<any>(null)
	const [logs, setLogs] = useState<Log[]>([])
	const [agent, setAgent] = useState<Agent | null>(null)
	const [account, setAccount] = useState<string | null>(null)
	const [isConnecting, setIsConnecting] = useState(false)

	const addLog = (msg: string, type?: 'info' | 'success' | 'error') => {
		const time = new Date().toLocaleTimeString()
		setLogs((prev) => [{ time, msg, type }, ...prev].slice(0, 10))
	}

	const connectWallet = async () => {
		if (!window.ethereum) {
			addLog(
				'No browser wallet detected. Please install a wallet like MetaMask!',
				'error',
			)
			return
		}

		try {
			setIsConnecting(true)
			addLog('Connecting to wallet...', 'info')

			// 1. Request accounts
			const addresses = await window.ethereum.request({
				method: 'eth_requestAccounts',
			})
			const address = addresses[0]
			setAccount(address)

			// 2. Setup Viem clients
			const walletClient = createWalletClient({
				account: address,
				transport: custom(window.ethereum),
			})

			const publicClient = createPublicClient({
				transport: custom(window.ethereum),
			})

			// 3. Initialize Agent with external clients
			const newAgent = new Agent({
				walletClient,
				publicClient,
				logger: {
					info: (msg, meta: any) =>
						addLog(
							`[SDK] ${msg}${meta?.txHash ? ` (${String(meta.txHash).slice(0, 10)}...)` : ''}`,
							'info',
						),
					error: (msg) => addLog(`[SDK ERROR] ${msg}`, 'error'),
					warn: (msg) => addLog(`[SDK WARN] ${msg}`, 'info'),
					debug: (msg, meta) => console.debug(msg, meta),
				},
			})

			setAgent(newAgent)
			addLog(
				`Wallet connected: ${address.slice(0, 6)}...${address.slice(-4)}`,
				'success',
			)
		} catch (error: any) {
			addLog(`Connection failed: ${error.message}`, 'error')
		} finally {
			setIsConnecting(false)
		}
	}

	const fetchData = async () => {
		if (!agent) {
			addLog('Please connect your wallet first', 'error')
			return
		}

		try {
			setStatus('requesting')
			setData(null)
			addLog(`Requesting data from ${SERVER_URL}...`)

			const response = await agent.request({
				url: PROTECTED_ENDPOINT,
				method: 'GET',
			})

			setData(response.data)
			setStatus('success')
			addLog('Access granted! Premium data retrieved.', 'success')
		} catch (error: any) {
			console.error(error)
			setStatus('error')
			addLog(`Failed: ${error.message}`, 'error')
		}
	}

	return (
		<div className="container">
			<div className="card">
				<header className="header">
					<div
						style={{
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center',
							marginBottom: '1rem',
						}}
					>
						<h1>Tempo</h1>
						<button
							className={`btn-primary ${account ? 'status-success' : ''}`}
							style={{
								flex: 'none',
								width: 'auto',
								borderRadius: '12px',
								padding: '0.6rem 1.2rem',
							}}
							onClick={connectWallet}
							disabled={isConnecting}
						>
							{isConnecting
								? 'Connecting...'
								: account
									? `${account.slice(0, 6)}...${account.slice(-4)}`
									: 'Connect Wallet'}
						</button>
					</div>
					<p className="subtitle">
						Instant Settlement for Any Service (HTTP 402)
					</p>

					<div
						className={`status-badge status-${status === 'confirming' || status === 'paying' ? 'paying' : status}`}
					>
						{status === 'idle' && 'READY'}
						{status === 'requesting' && 'REQUESTING...'}
						{status === 'paying' && 'SETTLING PAYMENT...'}
						{status === 'confirming' && 'CONFIRMING ON-CHAIN...'}
						{status === 'success' && 'ACCESS GRANTED'}
						{status === 'error' && 'FAILED'}
					</div>
				</header>

				<main className="main-content">
					<div className={`data-preview ${!data ? 'locked' : ''}`}>
						{data ? (
							<div className="data-display">
								{JSON.stringify(data, null, 2)}
							</div>
						) : null}
					</div>

					<div className="action-bar">
						{account ? (
							<button
								className="btn-primary"
								onClick={fetchData}
								disabled={
									status === 'requesting' ||
									status === 'paying' ||
									status === 'confirming'
								}
							>
								{status === 'requesting' ||
								status === 'paying' ||
								status === 'confirming' ? (
									<>
										<div className="spinner" />
										{status === 'requesting'
											? 'Communicating...'
											: 'Awaiting Signatures...'}
									</>
								) : (
									'Fetch Premium Data (0.10 USD)'
								)}
							</button>
						) : (
							<button className="btn-primary" onClick={connectWallet}>
								Connect Wallet to Begin
							</button>
						)}
					</div>
				</main>
			</div>

			<div className="card" style={{ padding: '1.5rem', opacity: 0.9 }}>
				<h3>Execution Logs</h3>
				<div className="log-container">
					{logs.length === 0 && (
						<p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
							Awaiting interaction...
						</p>
					)}
					{logs.map((log, i) => (
						<div key={i} className="log-entry">
							<span className="log-time">{log.time}</span>
							<span className={`log-msg ${log.type ? `log-${log.type}` : ''}`}>
								{log.msg}
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	)
}

export default App
