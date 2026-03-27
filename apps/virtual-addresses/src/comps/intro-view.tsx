import type * as React from 'react'
import { AddressAnatomy } from '#comps/address-anatomy'

const EXAMPLE_ADDRESS = '07A3B1C2FDFDFDFDFDFDFDFDFDFDFDFDFDD4E5A7C3F19E'

export function IntroView(): React.JSX.Element {
	return (
		<main className="max-w-5xl mx-auto px-6 py-8 space-y-5">
			{/* Hero */}
			<section className="space-y-2">
				<h1 className="text-lg font-semibold tracking-tight">
					TIP-1022: Virtual Addresses
				</h1>
				<p className="text-sm text-text-secondary leading-relaxed max-w-2xl">
					Precompile-native virtual addresses that auto-forward TIP-20
					deposits to a registered master wallet, eliminating sweep
					transactions entirely for exchanges, ramps, and payment processors.
				</p>
			</section>

			{/* Cards — each full width */}
			<div className="space-y-5">
				{/* Motivation */}
				<Card title="Motivation">
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
						<Reason
							label="No sweeps"
							text="Funds auto-credit master at the protocol level. No separate sweep transactions needed."
						/>
						<Reason
							label="No gas overhead"
							text="Virtual addresses never create on-chain state. No 250k gas new-account cost."
						/>
						<Reason
							label="No state bloat"
							text="Zero accounts created in the state trie regardless of how many deposit addresses are generated."
						/>
					</div>
				</Card>

				{/* Address Layout — horizontal: anatomy left, field descriptions right */}
				<Card title="Address Layout">
					<div className="flex flex-col lg:flex-row gap-5">
						<div className="bg-bg/60 rounded-lg p-4 border border-border overflow-x-auto font-mono lg:shrink-0">
							<AddressAnatomy address={EXAMPLE_ADDRESS} />
						</div>
						<div className="space-y-2.5 text-sm font-mono flex-1">
							<FieldDesc
								color="bg-master-id"
								name="masterId"
								bytes="4 bytes"
								detail="Deterministic ID from keccak256(masterAddress, salt)[4:8]. Registry lookup key."
							/>
							<FieldDesc
								color="bg-virtual-magic"
								name="magic"
								bytes="10 bytes"
								detail="Fixed pattern 0xFDFD..FD. Identifies the address as virtual."
							/>
							<FieldDesc
								color="bg-user-tag"
								name="userTag"
								bytes="6 bytes"
								detail="Opaque per-user identifier, derived off-chain. ~281 trillion addrs per master."
							/>
						</div>
					</div>
				</Card>

				{/* How It Works */}
				<Card title="How It Works">
					<ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
						<Step n={1} title="Register">
							Master calls{' '}
							<Code>registerVirtualMaster(salt)</Code>{' '}
							on the registry precompile. The salt must satisfy a 32-bit
							proof-of-work. One-time on-chain call.
						</Step>
						<Step n={2} title="Derive">
							Operator concatenates{' '}
							<span className="text-master-id">masterId</span> +{' '}
							<span className="text-virtual-magic">magic</span> +{' '}
							<span className="text-user-tag">userTag</span> off-chain.
							No transaction needed. Unlimited deposit addresses.
						</Step>
						<Step n={3} title="Receive">
							Sender transfers TIP-20 tokens to a virtual address. The
							precompile detects magic bytes, extracts masterId, looks up
							master, and credits the master wallet directly.
						</Step>
						<Step n={4} title="Attribute">
							Two Transfer events emitted for audit trail:
							<div className="font-mono text-text-secondary text-xs mt-1 space-y-0.5">
								<div>emit Transfer(sender, virtualAddr, amount)</div>
								<div>emit Transfer(virtualAddr, master, amount)</div>
							</div>
						</Step>
					</ol>
				</Card>

				{/* Key Properties */}
				<Card title="Properties">
					<div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-sm">
						<Property k="registration" v="one-time, immutable" />
						<Property k="derivation" v="fully offchain" />
						<Property k="virtual balance" v="always 0" />
						<Property k="scope" v="TIP-20 transfers only" />
						<Property k="authorization" v="checked on master" />
						<Property k="PoW cost" v="~2^32 hashes" />
						<Property k="collision attack" v="~2^64 work" />
						<Property k="format grinding" v="~2^80 work" />
					</div>
				</Card>

				{/* Security & Limitations */}
				<Card title="Security & Limitations">
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
						<Notice level="warn">
							Non-TIP-20 tokens sent to virtual addresses credit the literal
							address and may be irrecoverable.
						</Notice>
						<Notice level="warn">
							Wallets and explorers should display full addresses to
							distinguish masterId and userTag.
						</Notice>
						<Notice level="info">
							Registrations are immutable. Use an upgradeable proxy or
							multisig for key rotation.
						</Notice>
						<Notice level="info">
							TIP-403 policies are evaluated on the resolved master, not
							the virtual alias.
						</Notice>
					</div>
				</Card>
			</div>
		</main>
	)
}

// ── Primitives ──────────────────────────────────────────────────────

function Card(props: {
	title: string
	className?: string
	children: React.ReactNode
}): React.JSX.Element {
	return (
		<section className={`rounded-xl bg-bg border border-border p-5 space-y-3 ${props.className ?? ''}`}>
			<h2 className="text-label text-text-secondary">{props.title}</h2>
			{props.children}
		</section>
	)
}

function Reason(props: { label: string; text: string }): React.JSX.Element {
	return (
		<div className="flex gap-2.5 text-sm">
			<span className="text-positive shrink-0 mt-px">+</span>
			<div>
				<span className="font-medium">{props.label}</span>
				<span className="text-text-secondary mx-1.5">--</span>
				<span className="text-text-secondary">{props.text}</span>
			</div>
		</div>
	)
}

function FieldDesc(props: {
	color: string
	name: string
	bytes: string
	detail: string
}): React.JSX.Element {
	return (
		<div className="flex gap-2.5">
			<span
				className={`w-2 h-2 rounded-full ${props.color} shrink-0 mt-1.5`}
			/>
			<div>
				<div>
					<span className="text-text-primary font-medium">{props.name}</span>
					<span className="text-text-secondary ml-1.5">({props.bytes})</span>
				</div>
				<div className="text-text-secondary text-xs mt-0.5">{props.detail}</div>
			</div>
		</div>
	)
}

function Step(props: {
	n: number
	title: string
	children: React.ReactNode
}): React.JSX.Element {
	return (
		<li className="space-y-2">
			<div className="flex items-center gap-2">
				<span className="w-5 h-5 rounded bg-surface-2 border border-border text-[10px] font-mono flex items-center justify-center shrink-0 text-text-secondary">
					{props.n}
				</span>
				<span className="text-sm font-medium">{props.title}</span>
			</div>
			<div className="text-sm text-text-secondary">{props.children}</div>
		</li>
	)
}

function Code(props: { children: React.ReactNode }): React.JSX.Element {
	return (
		<code className="text-xs bg-surface-2 px-1.5 py-0.5 rounded font-mono text-accent">
			{props.children}
		</code>
	)
}

function Property(props: { k: string; v: string }): React.JSX.Element {
	return (
		<div className="bg-surface-2/50 rounded-lg px-3.5 py-2.5 border border-border">
			<div className="text-label mb-1">{props.k}</div>
			<div className="text-text-primary">{props.v}</div>
		</div>
	)
}

function Notice(props: {
	level: 'warn' | 'info'
	children: React.ReactNode
}): React.JSX.Element {
	const isWarn = props.level === 'warn'
	return (
		<div className="flex gap-2 text-text-secondary">
			<span
				className={`shrink-0 font-mono text-xs mt-0.5 ${isWarn ? 'text-warning' : 'text-text-secondary'}`}
			>
				{isWarn ? 'warn' : 'info'}
			</span>
			<span>{props.children}</span>
		</div>
	)
}
