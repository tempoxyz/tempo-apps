import { useState, useEffect } from 'react'
import { formatUnits } from 'viem'
import { useWebAuthnContext } from './WebAuthnContext'

export function WalletConnect() {
	const {
		address,
		isConnected,
		isLoading,
		error,
		signUp,
		signIn,
		disconnect,
		getBalance,
	} = useWebAuthnContext()

	const [balance, setBalance] = useState<bigint | null>(null)
	const [faucetLoading, setFaucetLoading] = useState(false)

	// Fetch balance when connected
	useEffect(() => {
		if (isConnected) {
			getBalance().then(setBalance)
		}
	}, [isConnected, getBalance])

	const handleFaucet = async () => {
		if (!address) return

		setFaucetLoading(true)
		try {
			const response = await fetch('https://rpc.moderato.tempo.xyz', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'tempo_fundAddress',
					params: [address],
				}),
			})

			const data = (await response.json()) as {
				error?: { message: string }
				result?: string[]
			}

			if (data.error) {
				console.error('Faucet error:', data.error)
			} else {
				console.log('Faucet success:', data.result)
				// Wait a moment then refresh balance
				setTimeout(async () => {
					const newBalance = await getBalance()
					setBalance(newBalance)
				}, 2000)
			}
		} catch (err) {
			console.error('Faucet request failed:', err)
		} finally {
			setFaucetLoading(false)
		}
	}

	const formatBalanceDisplay = (bal: bigint | null) => {
		if (bal === null) return '$0.00'
		const value = Number(formatUnits(bal, 6))
		return `$${value.toFixed(2)}`
	}

	const _formatAddress = (addr: string) => {
		return `${addr.slice(0, 6)}...${addr.slice(-4)}`
	}

	if (isConnected && address) {
		const explorerUrl = `https://explorer.tempo.xyz/address/${address}`
		return (
			<div className="wallet-section">
				<div className="wallet-connected">
					<div className="wallet-info">
						<span className="label">addr</span>
						<a
							href={explorerUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="value address-link"
							title={address}
						>
							{address}
						</a>
					</div>
					<div className="wallet-info">
						<span className="label">bal</span>
						<span className="value">{formatBalanceDisplay(balance)}</span>
						<button
							type="button"
							className="btn btn-faucet"
							onClick={handleFaucet}
							disabled={faucetLoading}
						>
							{faucetLoading ? '...' : 'get funds'}
						</button>
					</div>
					<button
						type="button"
						className="btn btn-disconnect"
						onClick={disconnect}
					>
						disconnect
					</button>
				</div>
			</div>
		)
	}

	return (
		<div className="wallet-section">
			<div className="wallet-disconnected">
				{isLoading ? (
					<div className="loading-state">authenticating with passkey...</div>
				) : (
					<div className="connect-buttons">
						<button
							type="button"
							className="btn btn-connect"
							onClick={signUp}
							disabled={isLoading}
						>
							sign up with passkey
						</button>
						<button
							type="button"
							className="btn btn-connect btn-secondary"
							onClick={signIn}
							disabled={isLoading}
						>
							sign in
						</button>
						{error && <div className="error-message">{error}</div>}
					</div>
				)}
			</div>
		</div>
	)
}
