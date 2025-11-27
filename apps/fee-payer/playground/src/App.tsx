import { Hooks } from 'tempo.ts/wagmi'
import { formatUnits, pad, parseUnits, stringToHex } from 'viem'
import {
	useAccount,
	useConnect,
	useConnectors,
	useDisconnect,
	useWatchBlockNumber,
} from 'wagmi'
import { alphaUsd } from './wagmi.config'

export function App() {
	const account = useAccount()

	const alphaUsdBalance = Hooks.token.useGetBalance({
		account: account?.address,
		token: alphaUsd,
	})

	return (
		<div>
			<h1>Tempo Example</h1>
			<hr />
			{account.isConnected ? (
				<>
					<h2>Account</h2>
					<Account />
					<h2>Fund Account</h2>
					<FundAccount />
					<h2>Balances</h2>
					<Balance />
					{alphaUsdBalance.data && alphaUsdBalance.data > 0n && (
						<>
							<h2>Send 100 Alpha USD</h2>
							<SendPayment />
						</>
					)}
				</>
			) : (
				<>
					<h2>Connect</h2>
					<Connect />
				</>
			)}
		</div>
	)
}

export function Connect() {
	const connect = useConnect()
	const [connector] = useConnectors()

	return (
		<div>
			<button
				onClick={() =>
					connect.connect({ connector, capabilities: { createAccount: true } })
				}
				type="button"
			>
				Sign up
			</button>
			<button onClick={() => connect.connect({ connector })} type="button">
				Sign in
			</button>
		</div>
	)
}

export function Account() {
	const account = useAccount()
	const disconnect = useDisconnect()

	return (
		<div>
			<div>
				<strong>Address: </strong>
				{account.address}
			</div>
			<button type="button" onClick={() => disconnect.disconnect()}>
				Disconnect
			</button>
		</div>
	)
}

export function Balance() {
	const account = useAccount()

	const alphaUsdBalance = Hooks.token.useGetBalance({
		account: account?.address,
		token: alphaUsd,
	})
	const alphaUsdMetadata = Hooks.token.useGetMetadata({
		token: alphaUsd,
	})

	useWatchBlockNumber({
		onBlockNumber() {
			alphaUsdBalance.refetch()
		},
	})

	// Only show section if alphaUsd metadata is loaded
	if (!alphaUsdMetadata.data) return null
	return (
		<div>
			<strong>{alphaUsdMetadata.data?.name} Balance: </strong>
			{formatUnits(
				alphaUsdBalance.data ?? 0n,
				alphaUsdMetadata.data?.decimals ?? 6,
			)}{' '}
			{alphaUsdMetadata.data?.symbol}
		</div>
	)
}

export function FundAccount() {
	const account = useAccount()
	const fund = Hooks.faucet.useFund()

	if (!account.address) return null
	return (
		<div>
			<button
				disabled={fund.isPending}
				type="button"
				onClick={() => fund.mutate({ account: account.address! })}
			>
				Fund Account
			</button>

			{fund.data && (
				<div>
					Receipts:{' '}
					{fund.data.map((hash) => (
						<div key={hash}>
							<a href={`https://explore.tempo.xyz/${hash}`} target="_blank">
								{hash}
							</a>
						</div>
					))}
				</div>
			)}
		</div>
	)
}

export function SendPayment() {
	const sendPayment = Hooks.token.useTransferSync()
	const metadata = Hooks.token.useGetMetadata({
		token: alphaUsd,
	})

	if (!metadata.data) return null
	return (
		<form
			onSubmit={(event) => {
				event.preventDefault()
				const formData = new FormData(event.target as HTMLFormElement)

				const recipient = (formData.get('recipient') ||
					'0x0000000000000000000000000000000000000000') as `0x${string}`
				const memo = formData.get('memo') as string

				sendPayment.mutate({
					amount: parseUnits('100', metadata.data.decimals),
					memo: memo ? pad(stringToHex(memo), { size: 32 }) : undefined,
					feePayer: true,
					to: recipient,
					token: alphaUsd,
				})
			}}
		>
			<div>
				<label htmlFor="recipient">Recipient address</label>
				<input type="text" name="recipient" placeholder="0x..." />
			</div>

			<div>
				<label htmlFor="memo">Memo (optional)</label>
				<input type="text" name="memo" placeholder="INV-12345" />
			</div>

			<button disabled={sendPayment.isPending} type="submit">
				Send Payment
			</button>

			{sendPayment.data && (
				<a
					href={`https://explore.tempo.xyz/tx/${sendPayment.data.receipt.transactionHash}`}
					target="_blank"
					rel="noopener noreferrer"
				>
					View receipt
				</a>
			)}
		</form>
	)
}
