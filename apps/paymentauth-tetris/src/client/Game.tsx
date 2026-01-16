import { useState, useEffect, useCallback } from 'react'
import { encodeFunctionData } from 'viem'
import { Abis } from 'viem/tempo'
import { useWebAuthnContext } from './WebAuthnContext'

interface GameMetadata {
	moveCount: number
	linesCleared: number
	lastMove: string
	lastMoveBy?: string
}

interface GameState {
	ascii: string
	metadata: GameMetadata
	display: number[]
}

interface PaymentChallenge {
	id: string
	realm: string
	method: string
	intent: string
	request: {
		amount: string
		asset: string
		destination: string
		expires: string
	}
	expires: string
	description?: string
}

type TetrisAction = 'left' | 'right' | 'rotate' | 'drop'

/** Encode a string to base64url (no padding) */
function base64urlEncode(input: string): string {
	const base64 = btoa(input)
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Decode a base64url string */
function base64urlDecode(input: string): string {
	let base64 = input.replace(/-/g, '+').replace(/_/g, '/')
	const padding = base64.length % 4
	if (padding) {
		base64 += '='.repeat(4 - padding)
	}
	return atob(base64)
}

function parseWwwAuthenticate(header: string): PaymentChallenge {
	const match = header.match(/^Payment\s+(.+)$/)
	if (!match) throw new Error('Invalid WWW-Authenticate')

	const params: Record<string, string> = {}
	const regex = /(\w+)="([^"]+)"/g
	for (const m of match[1].matchAll(regex)) {
		params[m[1]] = m[2]
	}

	// Decode request from base64url
	if (params.request) {
		params.request = JSON.parse(base64urlDecode(params.request))
	}

	return params as unknown as PaymentChallenge
}

export function Game() {
	const { address, isConnected, signTransaction, getBalance } =
		useWebAuthnContext()

	const [gameState, setGameState] = useState<GameState | null>(null)
	const [loading, setLoading] = useState(true)
	const [actionLoading, setActionLoading] = useState<TetrisAction | null>(null)
	const [error, setError] = useState<string | null>(null)

	// Fetch game state
	const fetchState = useCallback(async () => {
		try {
			const res = await fetch('/state')
			const data = (await res.json()) as GameState
			setGameState(data)
			setError(null)
		} catch (e) {
			setError('Failed to load game state')
			console.error(e)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchState()
		const interval = setInterval(fetchState, 10000)
		return () => clearInterval(interval)
	}, [fetchState])

	// Make a move
	const makeMove = useCallback(
		async (action: TetrisAction) => {
			if (!isConnected || !address) {
				setError('Please connect your wallet first')
				return
			}

			setActionLoading(action)
			setError(null)

			try {
				// Step 1: Request move (get 402 challenge)
				const challengeRes = await fetch(`/move/${action}`, {
					method: 'POST',
				})

				if (challengeRes.status !== 402) {
					throw new Error('Expected 402 challenge')
				}

				// Parse WWW-Authenticate header
				const wwwAuth = challengeRes.headers.get('WWW-Authenticate')
				if (!wwwAuth) throw new Error('No WWW-Authenticate header')

				const challenge = parseWwwAuthenticate(wwwAuth)
				console.log('✅ Step 1: Got challenge:', challenge.id)

				// Step 2: Sign the payment transaction using WebAuthn
				// viem/tempo handles the WebAuthn signature format natively
				console.log('⏳ Step 2: Preparing transaction...')
				const transferData = encodeFunctionData({
					abi: Abis.tip20,
					functionName: 'transfer',
					args: [
						challenge.request.destination as `0x${string}`,
						BigInt(challenge.request.amount),
					],
				})
				console.log(
					'⏳ Step 2: Signing with WebAuthn (you should see a passkey prompt)...',
				)

				const signedTx = await signTransaction({
					to: challenge.request.asset as `0x${string}`,
					data: transferData,
				})
				console.log(
					'✅ Step 2: Signed transaction:',
					`${signedTx.slice(0, 50)}...`,
				)

				// Step 3: Submit payment - encode credential as base64url JSON
				const credential = {
					id: challenge.id,
					payload: {
						type: 'transaction',
						signature: signedTx,
					},
				}

				const authHeader = `Payment ${base64urlEncode(
					JSON.stringify(credential),
				)}`

				const moveRes = await fetch(`/move/${action}`, {
					method: 'POST',
					headers: {
						Authorization: authHeader,
					},
				})

				const result = (await moveRes.json()) as GameState & {
					message?: string
					receipt?: { txHash: string }
				}

				if (!moveRes.ok) {
					throw new Error(result.message || 'Move failed')
				}

				// Update game state
				setGameState(result)

				// Refresh balance
				getBalance()

				console.log(`${action} complete! tx: ${result.receipt?.txHash}`)
			} catch (e) {
				const message = e instanceof Error ? e.message : 'Move failed'
				setError(message)
				console.error(e)
			} finally {
				setActionLoading(null)
			}
		},
		[isConnected, address, signTransaction, getBalance],
	)

	// Handle keyboard controls
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (!isConnected || actionLoading) return

			switch (e.key) {
				case 'ArrowLeft':
					makeMove('left')
					break
				case 'ArrowRight':
					makeMove('right')
					break
				case 'ArrowUp':
					makeMove('rotate')
					break
				case 'ArrowDown':
					makeMove('drop')
					break
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [isConnected, actionLoading, makeMove])

	const formatLastMove = (metadata: GameMetadata) => {
		if (metadata.lastMoveBy) {
			const addr = metadata.lastMoveBy
			return `${addr.slice(0, 6)}...${addr.slice(-4)}`
		}
		return '--'
	}

	return (
		<div className="game-container">
			<div className="frame">
				<div className="header">
					<div className="title">pay-to-play</div>
					<div className="stats">
						moves{' '}
						<span className="stat-value">
							{gameState?.metadata.moveCount ?? 0}
						</span>{' '}
						· last{' '}
						<span className="stat-value">
							{gameState ? formatLastMove(gameState.metadata) : '--'}
						</span>
					</div>
				</div>

				<div className="display-container">
					<pre className="display">
						{loading ? 'loading...' : (gameState?.ascii ?? 'no data')}
					</pre>
				</div>

				<div className="controls">
					<div className="controls-grid">
						<button
							type="button"
							className="btn"
							onClick={() => makeMove('left')}
							disabled={!isConnected || actionLoading !== null}
						>
							<span className="btn-key">←</span>
							{actionLoading === 'left' ? '...' : 'left'}
						</button>
						<button
							type="button"
							className="btn"
							onClick={() => makeMove('right')}
							disabled={!isConnected || actionLoading !== null}
						>
							<span className="btn-key">→</span>
							{actionLoading === 'right' ? '...' : 'right'}
						</button>
						<button
							type="button"
							className="btn"
							onClick={() => makeMove('rotate')}
							disabled={!isConnected || actionLoading !== null}
						>
							<span className="btn-key">↻</span>
							{actionLoading === 'rotate' ? '...' : 'rotate'}
						</button>
						<button
							type="button"
							className="btn"
							onClick={() => makeMove('drop')}
							disabled={!isConnected || actionLoading !== null}
						>
							<span className="btn-key">↓</span>
							{actionLoading === 'drop' ? '...' : 'drop'}
						</button>
					</div>
					<div className="info-row">
						<span>$0.01 / move</span>
						{error && <span className="error">{error}</span>}
					</div>
				</div>
			</div>
		</div>
	)
}
