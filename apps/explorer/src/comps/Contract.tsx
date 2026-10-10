import { Link } from '@tanstack/react-router'
import {
	Alert,
	Badge,
	IconButton,
	Tooltip,
	style,
	variants,
} from '@tempoxyz/ds/platform'
import {
	Check,
	ChevronDown,
	Copy,
	Download,
	ExternalLink,
} from '@tempoxyz/ds/platform/icons'
import type { Address } from 'ox'
import * as React from 'react'
import type { Abi } from 'viem'
import { useBytecode, usePublicClient } from 'wagmi'
import { cx } from 'zyzz'
import { ConnectWallet } from '#comps/ConnectWallet.tsx'
import { AbiViewer } from '#comps/ContractAbi.tsx'
import { ContractReader } from '#comps/ContractReader.tsx'
import { SourceSection } from '#comps/ContractSource.tsx'
import { ContractWriter } from '#comps/ContractWriter.tsx'
import { ellipsis } from '#lib/chars.ts'
import type { ContractSource } from '#lib/domain/contract-source.ts'
import {
	autoloadAbi,
	getContractAbi,
	isInferredAbi,
	resolveInteractAbi,
} from '#lib/domain/contracts.ts'
import {
	detectProxy,
	type ProxyInfo,
	type ProxyType,
} from '#lib/domain/proxy.ts'
import { isTip20Address } from '#lib/domain/tip20.ts'
import { useCopy, useDownload } from '#lib/hooks.ts'
import { link, linkHover, pressDown, transitionColors } from '#styles/explorer'

const proxyTypeUrls: Record<ProxyType, string> = {
	'EIP-1967': 'https://eips.ethereum.org/EIPS/eip-1967',
	'EIP-1822': 'https://eips.ethereum.org/EIPS/eip-1822',
	Beacon: 'https://eips.ethereum.org/EIPS/eip-1967#beacon-contract-address',
	Legacy: 'https://docs.openzeppelin.com/contracts/4.x/api/proxy',
}

function proxyTypeUrl(type: ProxyType | undefined): string {
	return type ? proxyTypeUrls[type] : proxyTypeUrls['EIP-1967']
}

function InferredAbiNotice({ abi }: { abi: Abi }): React.JSX.Element | null {
	if (!isInferredAbi(abi)) return null
	return (
		<p {...styles.inferredNotice()}>
			Inferred ABI: function names, read/write classifications, and return types
			may be incomplete or incorrect. Verify the contract source for an accurate
			ABI.
		</p>
	)
}

/** Small tertiary icon action in a section header. */
function SectionAction(props: {
	children: React.ReactElement
	label: string
	onClick: () => void
}): React.JSX.Element {
	return (
		<Tooltip content={props.label}>
			<IconButton
				aria-label={props.label}
				onClick={props.onClick}
				scale="small"
				variant="tertiary"
				{...cx(styles.actionButton(), pressDown(), transitionColors())}
			>
				{props.children}
			</IconButton>
		</Tooltip>
	)
}

/**
 * Contract tab content - shows ABI and Source
 */
export function ContractTabContent(props: {
	address: Address.Address
	abi?: Abi
	docsUrl?: string
	isLoadingContractInfo?: boolean
	source?: ContractSource
}) {
	const { address, docsUrl, source } = props
	const isTip20 = isTip20Address(address)

	const { copy: copyAbi, notifying: copiedAbi } = useCopy({ timeout: 2_000 })

	const [abiExpanded, setAbiExpanded] = React.useState(false)
	const abi = props.abi ?? getContractAbi(address)

	const handleCopyAbi = React.useCallback(() => {
		if (!abi) return
		void copyAbi(JSON.stringify(abi, null, 2))
	}, [abi, copyAbi])

	const { download: downloadAbi } = useDownload({
		contentType: 'application/json',
		value: JSON.stringify(abi, null, 2),
		filename: `${address.toLowerCase()}-abi.json`,
	})

	if (!abi) {
		return (
			<div {...styles.emptyCard()}>
				<p {...styles.emptyMessage()}>
					{props.isLoadingContractInfo
						? `Loading contract information${ellipsis}`
						: 'No ABI available for this contract.'}
				</p>
			</div>
		)
	}

	return (
		<div {...styles.tabContent()}>
			{/* TIP-20 Banner */}
			{isTip20 && (
				<div {...styles.tip20Banner()}>
					<span {...styles.nowrap()}>TIP-20 Native Precompile</span>
					<span {...styles.separator()}>·</span>
					<a
						href="https://tempo.xyz/developers/docs/protocol/tip20/spec/#tip20"
						target="_blank"
						rel="noopener noreferrer"
						{...cx(styles.nowrap(), link(), linkHover())}
					>
						Spec
					</a>
					<a
						href="https://github.com/tempoxyz/tempo/tree/main/crates/precompiles/src/tip20"
						target="_blank"
						rel="noopener noreferrer"
						{...cx(styles.nowrap(), link(), linkHover())}
					>
						Rust
					</a>
				</div>
			)}

			{/* Source Section */}
			{source && <SourceSection {...source} docsUrl={docsUrl} />}

			{/* ABI Section */}
			<InferredAbiNotice abi={abi} />
			<CollapsibleSection
				first={!isTip20}
				title="ABI"
				expanded={abiExpanded}
				onToggle={() => setAbiExpanded(!abiExpanded)}
				actions={
					<>
						<SectionAction label="Copy ABI" onClick={handleCopyAbi}>
							{copiedAbi ? <Check /> : <Copy />}
						</SectionAction>
						<SectionAction label="Download ABI" onClick={downloadAbi}>
							<Download />
						</SectionAction>
						{docsUrl && !source && (
							<a
								href={docsUrl}
								target="_blank"
								rel="noopener noreferrer"
								{...cx(styles.docsLink(), link(), linkHover(), pressDown())}
							>
								Docs
								<ExternalLink />
							</a>
						)}
					</>
				}
			>
				<AbiViewer abi={abi} enabled={abiExpanded} />
			</CollapsibleSection>

			{/* Bytecode Section - hidden for TIP-20 */}
			{!isTip20 && <BytecodeSection address={address} />}
		</div>
	)
}

/**
 * Collapsible section component
 */
export function CollapsibleSection(props: {
	title: React.ReactNode
	expanded: boolean
	onToggle: () => void
	actions?: React.ReactNode
	children: React.ReactNode
	first?: boolean
}) {
	const { title, expanded, onToggle, actions, children, first } = props

	return (
		<div {...styles.section()}>
			<div {...styles.sectionHeader()}>
				<button
					type="button"
					aria-expanded={expanded}
					onClick={onToggle}
					{...cx(
						styles.sectionToggle(),
						Boolean(actions) && styles.sectionToggleWithActions(),
						!actions && styles.sectionToggleFill(),
						first && styles.sectionToggleFirst(),
						first && !actions && styles.sectionToggleFirstEnd(),
						pressDown(),
					)}
				>
					<span {...styles.sectionTitle()}>{title}</span>
					<ChevronDown {...styles.chevron({ expanded })} />
				</button>
				{actions && <div {...styles.sectionActions()}>{actions}</div>}
			</div>
			<div {...cx(!expanded && styles.hidden())}>{children}</div>
		</div>
	)
}

/**
 * Bytecode section - shows raw bytecode
 */
function BytecodeSection(props: { address: Address.Address }) {
	const { address } = props
	const [expanded, setExpanded] = React.useState(false)
	const { copy, notifying } = useCopy({ timeout: 2000 })

	const { data: bytecode } = useBytecode({ address })

	const handleCopy = React.useCallback(() => {
		if (bytecode) void copy(bytecode)
	}, [bytecode, copy])

	const { download: downloadBytecode } = useDownload({
		value: bytecode ?? '',
		contentType: 'text/plain',
		filename: `${address.toLowerCase()}-bytecode.txt`,
	})

	return (
		<CollapsibleSection
			title="Bytecode"
			expanded={expanded}
			onToggle={() => setExpanded(!expanded)}
			actions={
				<>
					<SectionAction label="Copy bytecode" onClick={handleCopy}>
						{notifying ? <Check /> : <Copy />}
					</SectionAction>
					<SectionAction label="Download bytecode" onClick={downloadBytecode}>
						<Download />
					</SectionAction>
				</>
			}
		>
			<div {...styles.bytecode()}>
				<pre {...styles.bytecodeText()} suppressHydrationWarning>
					{bytecode ?? `Loading${ellipsis}`}
				</pre>
			</div>
		</CollapsibleSection>
	)
}

/**
 * Interact tab content - shows Read and Write contract functions
 * Supports proxy passthrough - detects proxy contracts and fetches implementation ABI
 * Also allows interacting with the proxy contract's own functions
 */
export function InteractTabContent(props: {
	address: Address.Address
	abi?: Abi
	docsUrl?: string
	isLoadingContractInfo?: boolean
}) {
	const { address } = props
	const publicClient = usePublicClient()

	const [readExpanded, setReadExpanded] = React.useState(true)
	const [writeExpanded, setWriteExpanded] = React.useState(true)
	const [proxyFunctionsExpanded, setProxyFunctionsExpanded] =
		React.useState(false)
	const [proxyInfo, setProxyInfo] = React.useState<ProxyInfo | null>(null)
	const [implAbi, setImplAbi] = React.useState<Abi | null>(null)
	const [proxyAbi, setProxyAbi] = React.useState<Abi | null>(null)
	const [isLoadingProxy, setIsLoadingProxy] = React.useState(false)

	// Detect proxy and load implementation ABI
	React.useEffect(() => {
		if (!publicClient) return

		const loadProxyInfo = async () => {
			setIsLoadingProxy(true)
			try {
				const proxy = await detectProxy(publicClient, address)
				setProxyInfo(proxy)

				// If it's a proxy, load both implementation and proxy ABIs
				if (proxy.isProxy && proxy.implementationAddress) {
					const [loadedImplAbi, loadedProxyAbi] = await Promise.all([
						autoloadAbi(proxy.implementationAddress, { followProxies: false }),
						autoloadAbi(address, { followProxies: false }),
					])
					if (loadedImplAbi) setImplAbi(loadedImplAbi)
					if (loadedProxyAbi) setProxyAbi(loadedProxyAbi)
				}
			} catch {
				// Ignore proxy detection errors
			} finally {
				setIsLoadingProxy(false)
			}
		}

		void loadProxyInfo()
	}, [publicClient, address])

	const abi = resolveInteractAbi({
		address,
		abi: props.abi,
		implementationAbi: implAbi,
	})

	if (props.isLoadingContractInfo || isLoadingProxy) {
		return (
			<div {...styles.emptyCard()}>
				<p {...styles.emptyMessage()}>Loading contract information{ellipsis}</p>
			</div>
		)
	}

	if (!abi) {
		return (
			<div {...styles.emptyCard()}>
				<p {...styles.emptyMessage()}>No ABI available for this contract.</p>
			</div>
		)
	}

	const isProxy = proxyInfo?.isProxy ?? false
	const implementationAddress = proxyInfo?.implementationAddress
	const hasProxyFunctions = proxyAbi && proxyAbi.length > 0

	return (
		<div {...styles.tabContent()}>
			{/* Proxy Info Banner */}
			{isProxy && implementationAddress && (
				<div {...styles.proxyBanner()}>
					<a
						href={proxyTypeUrl(proxyInfo?.type)}
						target="_blank"
						rel="noopener noreferrer"
						{...styles.badgeLink()}
					>
						<Badge scale="small" variant="white">
							{proxyInfo?.type} Proxy
							<ExternalLink />
						</Badge>
					</a>
					<span {...styles.implementationLabel()}>Implementation:</span>
					<Link
						to="/address/$address"
						params={{ address: implementationAddress }}
						search={{ tab: 'interact' }}
						{...cx(styles.implementationLink(), link(), linkHover())}
					>
						{implementationAddress.slice(0, 10)}...
						{implementationAddress.slice(-8)}
					</Link>
				</div>
			)}

			{/* Write Contract Section (Implementation functions via proxy) */}
			<InferredAbiNotice abi={abi} />
			<CollapsibleSection
				first={!isProxy}
				title={isProxy ? 'Write (via Proxy)' : 'Write'}
				expanded={writeExpanded}
				onToggle={() => setWriteExpanded(!writeExpanded)}
				actions={<ConnectWallet />}
			>
				<div {...styles.sectionBody()}>
					<ContractWriter address={address} abi={abi} />
				</div>
			</CollapsibleSection>

			{/* Read Contract Section (Implementation functions via proxy) */}
			<CollapsibleSection
				title={isProxy ? 'Read (via Proxy)' : 'Read'}
				expanded={readExpanded}
				onToggle={() => setReadExpanded(!readExpanded)}
			>
				<div {...styles.sectionBody()}>
					<ContractReader address={address} abi={abi} />
				</div>
			</CollapsibleSection>

			{/* Proxy Contract Functions Section */}
			{isProxy && hasProxyFunctions && (
				<CollapsibleSection
					title="Proxy Contract Functions"
					expanded={proxyFunctionsExpanded}
					onToggle={() => setProxyFunctionsExpanded(!proxyFunctionsExpanded)}
					actions={
						<span {...styles.proxyFunctionsNote()}>Direct proxy functions</span>
					}
				>
					<div {...styles.proxyFunctionsBody()}>
						<Alert
							tone="warning"
							title="These are functions defined on the proxy contract itself, not the implementation."
							style={fullWidth}
						/>
						<InferredAbiNotice abi={proxyAbi} />
						<ContractReader address={address} abi={proxyAbi} />
						<ContractWriter address={address} abi={proxyAbi} />
					</div>
				</CollapsibleSection>
			)}
		</div>
	)
}

const fullWidth = { width: '100%' } satisfies React.CSSProperties

namespace styles {
	export const inferredNotice = style({
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'dashed',
		color: 'content.secondary',
		paddingBlock: '12',
		paddingInline: '16',
		typography: 'body.b3',
	})

	export const emptyCard = style({
		backgroundColor: 'background.secondary',
		borderRadius: 'xs',
		height: '100% !custom',
		padding: '20',
	})

	export const emptyMessage = style({
		color: 'content.secondary',
		typography: 'body.b2',
	})

	export const tabContent = style({
		display: 'flex',
		flexDirection: 'column',
		height: '100% !custom',
		selectors: {
			'& > :last-child': { borderBottomColor: 'transparent !custom' },
		},
	})

	export const tip20Banner = style({
		alignItems: 'center',
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		color: 'content.secondary',
		columnGap: '8',
		display: 'flex',
		flexWrap: 'wrap',
		paddingBlock: '12',
		paddingInline: '16',
		rowGap: '4',
		typography: 'body.b3',
	})

	export const nowrap = style({ whiteSpace: 'nowrap' })

	export const separator = style({ color: 'content.tertiary' })

	export const actionButton = style({
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.regular' },
		},
	})

	export const docsLink = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '4',
		typography: 'body.b3',
	})

	export const section = style({
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		display: 'flex',
		flexDirection: 'column',
	})

	export const sectionHeader = style({
		alignItems: 'center',
		display: 'flex',
		flexShrink: 0,
		paddingBlock: '4',
	})

	// The panel clips overflow, so the ring is drawn inside, following the
	// panel's top corners on the first section.
	export const sectionToggle = style({
		alignItems: 'center',
		cursor: 'pointer',
		display: 'flex',
		gap: '8',
		height: '100% !custom',
		paddingBlock: '8',
		paddingInline: '16',
		':focus-visible': { outlineOffset: '-2px' },
	})

	export const sectionToggleWithActions = style({ paddingRight: '12' })

	export const sectionToggleFill = style({ flex: 1 })

	export const sectionToggleFirst = style({
		':focus-visible': { borderTopLeftRadius: 'xs' },
	})

	export const sectionToggleFirstEnd = style({
		':focus-visible': { borderTopRightRadius: 'xs' },
	})

	export const sectionTitle = style({
		color: 'content.secondary',
		typography: 'body.b2',
		whiteSpace: 'nowrap',
	})

	export const chevron = variants({
		base: { color: 'content.secondary', height: '16', width: '16' },
		defaultVariants: { expanded: false },
		variants: {
			expanded: { true: {}, false: { rotate: '-90deg' } },
		},
	})

	export const sectionActions = style({
		alignItems: 'stretch',
		color: 'content.secondary',
		display: 'flex',
		flex: 1,
		gap: '8',
		justifyContent: 'flex-end',
		minWidth: '0px !custom',
		paddingInline: '12',
	})

	export const hidden = style({ display: 'none' })

	export const bytecode = style({
		maxHeight: '280px !custom',
		overflow: 'auto',
		paddingBlock: '12',
		paddingInline: '20',
	})

	export const bytecodeText = style({
		color: 'content.primary',
		typography: 'mono.inline',
		whiteSpace: 'pre-wrap',
		wordBreak: 'break-all',
	})

	export const proxyBanner = style({
		alignItems: 'center',
		backgroundColor: 'container.regular',
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '8',
		paddingBlock: '12',
		paddingInline: '16',
		typography: 'body.b3',
	})

	// Wraps a small TDS Badge, which renders a span; the ring follows its
	// corners.
	export const badgeLink = style({
		borderRadius: '6px !custom',
		display: 'inline-flex',
		'@media (hover: hover)': {
			selectors: {
				'&:hover > span': { backgroundColor: 'container.strong' },
			},
		},
	})

	export const implementationLabel = style({ color: 'content.secondary' })

	export const implementationLink = style({ typography: 'mono.inline' })

	export const sectionBody = style({
		paddingBottom: '12',
		paddingInline: '12',
	})

	export const proxyFunctionsNote = style({
		alignItems: 'center',
		color: 'content.secondary',
		display: 'flex',
		typography: 'body.b3',
	})

	export const proxyFunctionsBody = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		paddingBottom: '12',
		paddingInline: '12',
	})
}
