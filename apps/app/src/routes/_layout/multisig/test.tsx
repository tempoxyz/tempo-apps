import { createFileRoute, Link } from '@tanstack/react-router'
import * as React from 'react'
import type { Address, Hex } from 'viem'
import { encodeFunctionData } from 'viem'
import { Abis, Addresses } from 'viem/tempo'
import { Layout } from '#comps/Layout'
import { decodeMultisigCall, getCallIcon } from '#lib/multisig'
import ArrowLeftIcon from '~icons/lucide/arrow-left'
import SendIcon from '~icons/lucide/send'
import PlusIcon from '~icons/lucide/plus'
import MinusIcon from '~icons/lucide/minus'
import CheckCircleIcon from '~icons/lucide/check-circle'
import RepeatIcon from '~icons/lucide/repeat'
import DownloadIcon from '~icons/lucide/download'
import UploadIcon from '~icons/lucide/upload'
import PlusCircleIcon from '~icons/lucide/plus-circle'
import XCircleIcon from '~icons/lucide/x-circle'
import SettingsIcon from '~icons/lucide/settings'
import CodeIcon from '~icons/lucide/code'

export const Route = createFileRoute('/_layout/multisig/test')({
	component: MultisigTestPage,
})

const PATHUSD = '0x20c0000000000000000000000000000000000000' as Address
const ALPHAUSD = '0x20c0000000000000000000000000000000000001' as Address
const TEST_RECIPIENT = '0x849151d7D0bF1F34b70d5caD5149D28CC2308bf1' as Address

function getIconComponent(iconName: string) {
	const icons: Record<string, React.ComponentType<{ className?: string }>> = {
		send: SendIcon,
		plus: PlusIcon,
		minus: MinusIcon,
		'check-circle': CheckCircleIcon,
		repeat: RepeatIcon,
		download: DownloadIcon,
		upload: UploadIcon,
		'plus-circle': PlusCircleIcon,
		'x-circle': XCircleIcon,
		settings: SettingsIcon,
		code: CodeIcon,
	}
	return icons[iconName] || CodeIcon
}

type TestCase = {
	name: string
	category: string
	to: Address
	value: bigint
	data: Hex
}

function createTestCases(): TestCase[] {
	return [
		// TIP-20 Token Operations
		{
			name: 'Transfer pathUSD',
			category: 'TIP-20',
			to: PATHUSD,
			value: 0n,
			data: encodeFunctionData({
				abi: Abis.tip20,
				functionName: 'transfer',
				args: [TEST_RECIPIENT, 1_500_000n], // 1.5 USD
			}),
		},
		{
			name: 'Mint AlphaUSD',
			category: 'TIP-20',
			to: ALPHAUSD,
			value: 0n,
			data: encodeFunctionData({
				abi: Abis.tip20,
				functionName: 'mint',
				args: [TEST_RECIPIENT, 10_000_000_000n], // 10,000 USD
			}),
		},
		{
			name: 'Burn pathUSD',
			category: 'TIP-20',
			to: PATHUSD,
			value: 0n,
			data: encodeFunctionData({
				abi: Abis.tip20,
				functionName: 'burn',
				args: [500_000n], // 0.5 USD
			}),
		},
		{
			name: 'Approve Spender',
			category: 'TIP-20',
			to: PATHUSD,
			value: 0n,
			data: encodeFunctionData({
				abi: Abis.tip20,
				functionName: 'approve',
				args: [Addresses.stablecoinDex, 100_000_000_000n], // 100,000 USD
			}),
		},

		// TIP-20 Factory
		{
			name: 'Create New Token',
			category: 'Factory',
			to: Addresses.tip20Factory,
			value: 0n,
			data: encodeFunctionData({
				abi: Abis.tip20Factory,
				functionName: 'createToken',
				args: [
					'Delta Dollar',
					'DUSD',
					'USD',
					PATHUSD, // quoteToken
					TEST_RECIPIENT, // admin
					'0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`, // salt
				],
			}),
		},

		// Stablecoin DEX
		{
			name: 'DEX Withdraw',
			category: 'DEX',
			to: Addresses.stablecoinDex,
			value: 0n,
			data: encodeFunctionData({
				abi: Abis.stablecoinDex,
				functionName: 'withdraw',
				args: [ALPHAUSD, 25_000_000_000n], // 25,000 USD
			}),
		},
		{
			name: 'Place Limit Order',
			category: 'DEX',
			to: Addresses.stablecoinDex,
			value: 0n,
			data: encodeFunctionData({
				abi: Abis.stablecoinDex,
				functionName: 'place',
				args: [PATHUSD, 1_000_000_000n, true, 100], // 1000 pathUSD bid at tick 100
			}),
		},
		{
			name: 'Cancel Order',
			category: 'DEX',
			to: Addresses.stablecoinDex,
			value: 0n,
			data: encodeFunctionData({
				abi: Abis.stablecoinDex,
				functionName: 'cancel',
				args: [42n],
			}),
		},

		// Fee Manager
		{
			name: 'Set Fee Token',
			category: 'Fees',
			to: Addresses.feeManager,
			value: 0n,
			data: encodeFunctionData({
				abi: Abis.feeManager,
				functionName: 'setUserToken',
				args: [PATHUSD],
			}),
		},

		// Raw call with no data
		{
			name: 'Empty Call',
			category: 'Other',
			to: TEST_RECIPIENT,
			value: 1_000_000_000_000_000_000n, // 1 ETH
			data: '0x' as Hex,
		},

		// Unknown contract call
		{
			name: 'Unknown Contract',
			category: 'Other',
			to: '0x1234567890123456789012345678901234567890' as Address,
			value: 0n,
			data: '0xabcdef1234567890' as Hex,
		},
	]
}

function MultisigTestPage() {
	const testCases = React.useMemo(() => createTestCases(), [])
	const categories = React.useMemo(() => {
		const cats = new Set(testCases.map((t) => t.category))
		return Array.from(cats)
	}, [testCases])

	return (
		<>
			<Layout.Header
				left={
					<Link
						to="/multisig"
						className="flex items-center gap-1.5 text-secondary hover:text-primary transition-colors press-down"
					>
						<ArrowLeftIcon className="size-4" />
						<span className="text-[13px]">Multisig</span>
					</Link>
				}
				right={null}
			/>
			<div className="flex flex-col flex-1 w-full max-w-2xl mx-auto px-4 py-6 gap-6">
				<div className="flex flex-col gap-2">
					<h1 className="text-primary text-[24px] font-semibold">
						Decoder Test
					</h1>
					<p className="text-secondary text-[14px]">
						Test page showing decoded transaction previews for various Tempo
						precompile calls.
					</p>
				</div>

				{categories.map((category) => (
					<div key={category} className="flex flex-col gap-3">
						<h2 className="text-tertiary text-[12px] uppercase tracking-wide">
							{category}
						</h2>
						<div className="flex flex-col gap-2">
							{testCases
								.filter((t) => t.category === category)
								.map((testCase, i) => (
									<TestCaseCard key={`${category}-${i}`} testCase={testCase} />
								))}
						</div>
					</div>
				))}
			</div>
		</>
	)
}

function TestCaseCard({ testCase }: { testCase: TestCase }) {
	const decoded = React.useMemo(
		() => decodeMultisigCall(testCase.to, testCase.value, testCase.data),
		[testCase],
	)
	const IconComponent = decoded
		? getIconComponent(getCallIcon(decoded))
		: CodeIcon

	return (
		<div className="flex flex-col gap-3 p-4 rounded-xl glass-thin">
			<div className="flex items-start gap-3">
				<div className="flex items-center justify-center size-9 rounded-lg glass-thin text-accent shrink-0">
					<IconComponent className="size-4" />
				</div>
				<div className="flex flex-col gap-0.5 min-w-0">
					<span className="text-primary text-[14px] font-medium">
						{decoded?.description ?? 'Unknown'}
					</span>
					<span className="text-tertiary text-[12px]">
						{testCase.name} · {decoded?.targetName}
					</span>
				</div>
			</div>

			{decoded && decoded.args.length > 0 && (
				<div className="flex flex-col gap-1 p-2 rounded-lg bg-base-alt/30">
					{decoded.args.map((arg) => (
						<div key={arg.name} className="flex items-center gap-2 text-[11px]">
							<span className="text-tertiary min-w-[80px]">{arg.name}:</span>
							<span className="text-secondary font-mono truncate">
								{arg.displayValue}
							</span>
						</div>
					))}
				</div>
			)}

			<div className="flex items-center gap-2 text-[10px] text-tertiary font-mono">
				<span>fn: {decoded?.functionName}</span>
				<span>·</span>
				<span className="truncate">data: {testCase.data.slice(0, 20)}…</span>
			</div>
		</div>
	)
}
