import type { Address } from 'ox'
import * as React from 'react'
import type { Abi } from 'viem'
import { useBytecode, usePublicClient } from 'wagmi'
import { Link } from '@tanstack/react-router'
import { ConnectWallet } from '#comps/ConnectWallet.tsx'
import { AbiViewer } from '#comps/ContractAbi.tsx'
import { ContractReader } from '#comps/ContractReader.tsx'
import { SourceSection } from '#comps/ContractSource.tsx'
import { ContractWriter } from '#comps/ContractWriter.tsx'
import { cx } from '#lib/css'
import { ellipsis } from '#lib/chars.ts'
import type { ContractSource } from '#lib/domain/contract-source.ts'
import { getContractAbi, autoloadAbi } from '#lib/domain/contracts.ts'
import { detectProxy, type ProxyInfo } from '#lib/domain/proxy.ts'
import { useCopy, useDownload } from '#lib/hooks.ts'
import ChevronDownIcon from '~icons/lucide/chevron-down'
import CopyIcon from '~icons/lucide/copy'
import DownloadIcon from '~icons/lucide/download'
import ExternalLinkIcon from '~icons/lucide/external-link'

/**
 * Contract tab content - shows ABI and Source
 */
export function ContractTabContent(props: {
	address: Address.Address
	abi?: Abi
	docsUrl?: string
	source?: ContractSource
}) {
	const { address, docsUrl, source } = props

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
			<div className="rounded-[10px] bg-card-header p-[18px] h-full">
				<p className="text-sm font-medium text-tertiary">
					No ABI available for this contract.
				</p>
			</div>
		)
	}

	return (
		<div className="flex flex-col h-full [&>*:last-child]:border-b-transparent">
			{/* Source Section */}
			{source && <SourceSection {...source} />}

			{/* ABI Section */}
			<CollapsibleSection
				first
				title={<span title="Contract ABI">ABI</span>}
				expanded={abiExpanded}
				onToggle={() => setAbiExpanded(!abiExpanded)}
				actions={
					<>
						{copiedAbi && (
							<span className="text-[11px] select-none">copied</span>
						)}
						<button
							type="button"
							onClick={handleCopyAbi}
							className="press-down cursor-pointer hover:text-secondary p-[4px]"
							title="Copy ABI"
						>
							<CopyIcon className="size-[14px]" />
						</button>
						<button
							type="button"
							onClick={downloadAbi}
							className="press-down cursor-pointer hover:text-secondary p-[4px]"
							title="Download ABI"
						>
							<DownloadIcon className="size-[14px]" />
						</button>
						{docsUrl && (
							<a
								href={docsUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="text-[11px] text-accent hover:underline press-down inline-flex items-center gap-[4px]"
							>
								Docs
								<ExternalLinkIcon className="size-[12px]" />
							</a>
						)}
					</>
				}
			>
				<AbiViewer abi={abi} />
			</CollapsibleSection>

			{/* Bytecode Section */}
			<BytecodeSection address={address} />
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
		<div className="flex flex-col border-b border-dashed border-distinct">
			<div className="flex items-center h-auto py-[6px] shrink-0">
				<button
					type="button"
					onClick={onToggle}
					className={cx(
						'flex items-center gap-[8px] h-full pl-[16px] cursor-pointer press-down focus-visible:-outline-offset-2! py-[6px]',
						actions ? 'pr-[12px]' : 'flex-1 pr-[16px]',
						first && 'focus-visible:rounded-tl-[8px]!',
						first && !actions && 'focus-visible:rounded-tr-[8px]!',
					)}
				>
					<span className="text-[14px] text-tertiary whitespace-nowrap font-sans">
						{title}
					</span>
					<ChevronDownIcon
						className={cx(
							'size-[14px] text-tertiary',
							!expanded && '-rotate-90',
						)}
					/>
				</button>
				{actions && (
					<div className="flex-1 flex items-stretch justify-end gap-[8px] text-tertiary px-[12px]">
						{actions}
					</div>
				)}
			</div>
			<div className={cx(!expanded && 'hidden')}>{children}</div>
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
					{notifying && <span className="text-[11px] select-none">copied</span>}
					<button
						type="button"
						onClick={handleCopy}
						className="press-down cursor-pointer hover:text-secondary p-[4px]"
						title="Copy bytecode"
					>
						<CopyIcon className="size-[14px]" />
					</button>
					<button
						type="button"
						onClick={downloadBytecode}
						className="press-down cursor-pointer hover:text-secondary p-[4px]"
						title="Download bytecode"
					>
						<DownloadIcon className="size-[14px]" />
					</button>
				</>
			}
		>
			<div className="max-h-[280px] overflow-auto px-[18px] py-[12px]">
				<pre
					className="text-[12px] leading-[18px] text-primary break-all whitespace-pre-wrap"
					suppressHydrationWarning
				>
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
}) {
	const { address, docsUrl } = props
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
						autoloadAbi(proxy.implementationAddress),
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

	// For proxies, prefer implementation ABI so users see callable functions
	const abi =
		(implAbi && implAbi.length > 0 ? implAbi : null) ??
		props.abi ??
		getContractAbi(address)

	if (isLoadingProxy) {
		return (
			<div className="rounded-[10px] bg-card-header p-[18px] h-full">
				<p className="text-sm font-medium text-tertiary">
					Loading contract information{ellipsis}
				</p>
			</div>
		)
	}

	if (!abi) {
		return (
			<div className="rounded-[10px] bg-card-header p-[18px] h-full">
				<p className="text-sm font-medium text-tertiary">
					No ABI available for this contract.
				</p>
			</div>
		)
	}

	const isProxy = proxyInfo?.isProxy ?? false
	const implementationAddress = proxyInfo?.implementationAddress
	const hasProxyFunctions = proxyAbi && proxyAbi.length > 0

	return (
		<div className="flex flex-col h-full [&>*:last-child]:border-b-transparent">
			{/* Proxy Info Banner */}
			{isProxy && implementationAddress && (
				<div className="flex items-center gap-[8px] px-[16px] py-[10px] bg-accent/10 border-b border-dashed border-distinct text-[13px]">
					<span className="px-[6px] py-[2px] bg-accent/20 text-accent rounded text-[11px] font-medium">
						{proxyInfo?.type} Proxy
					</span>
					<span className="text-secondary">Implementation:</span>
					<Link
						to="/address/$address"
						params={{ address: implementationAddress }}
						search={{ tab: 'interact' }}
						className="font-mono text-[12px] text-accent hover:underline"
					>
						{implementationAddress.slice(0, 10)}...
						{implementationAddress.slice(-8)}
					</Link>
				</div>
			)}

			{/* Write Contract Section (Implementation functions via proxy) */}
			<CollapsibleSection
				first={!isProxy}
				title={isProxy ? 'Write (via Proxy)' : 'Write'}
				expanded={writeExpanded}
				onToggle={() => setWriteExpanded(!writeExpanded)}
				actions={<ConnectWallet />}
			>
				<div className="px-[10px] pb-[10px]">
					<ContractWriter address={address} abi={abi} />
				</div>
			</CollapsibleSection>

			{/* Read Contract Section (Implementation functions via proxy) */}
			<CollapsibleSection
				title={isProxy ? 'Read (via Proxy)' : 'Read'}
				expanded={readExpanded}
				onToggle={() => setReadExpanded(!readExpanded)}
			>
				<div className="px-[10px] pb-[10px]">
					<ContractReader address={address} abi={abi} docsUrl={docsUrl} />
				</div>
			</CollapsibleSection>

			{/* Proxy Contract Functions Section */}
			{isProxy && hasProxyFunctions && (
				<CollapsibleSection
					title="Proxy Contract Functions"
					expanded={proxyFunctionsExpanded}
					onToggle={() => setProxyFunctionsExpanded(!proxyFunctionsExpanded)}
					actions={
						<span className="text-[11px] text-secondary">
							Direct proxy functions
						</span>
					}
				>
					<div className="px-[10px] pb-[10px] flex flex-col gap-[12px]">
						<div className="text-[12px] text-secondary px-[6px] py-[4px] bg-amber-500/10 rounded border border-amber-500/20">
							These are functions defined on the proxy contract itself, not the
							implementation.
						</div>
						<ContractReader address={address} abi={proxyAbi} />
						<ContractWriter address={address} abi={proxyAbi} />
					</div>
				</CollapsibleSection>
			)}
		</div>
	)
}

export function ContractFeatureCard(props: {
	title: string
	rightSideTitle?: string
	actions?: React.ReactNode
	children: React.ReactNode
	description?: React.ReactNode
	rightSideDescription?: string
	textGrid?: Array<{ left?: React.ReactNode; right?: React.ReactNode }>
	collapsible?: boolean
	defaultCollapsed?: boolean
}) {
	const {
		title,
		description,
		actions,
		children,
		rightSideDescription,
		rightSideTitle,
		textGrid,
		collapsible,
		defaultCollapsed,
	} = props

	const [isCollapsed, setIsCollapsed] = React.useState(
		defaultCollapsed ?? false,
	)

	if (collapsible) {
		return (
			<section
				className={cx(
					'flex flex-col w-full overflow-hidden',
					'rounded-[10px] border border-card-border bg-card-header',
					'shadow-[0px_4px_44px_rgba(0,0,0,0.05)]',
				)}
			>
				<div className="flex items-center h-[36px] shrink-0">
					<button
						type="button"
						onClick={() => setIsCollapsed(!isCollapsed)}
						className={cx(
							'flex-1 flex items-center gap-[6px] h-full pl-[16px] cursor-pointer press-down focus-visible:-outline-offset-2!',
							actions ? 'pr-[12px]' : 'pr-[16px]',
						)}
					>
						<span className="text-[13px] text-tertiary whitespace-nowrap">
							{title}
						</span>
						<ChevronDownIcon
							className={cx(
								'size-[14px] text-tertiary',
								isCollapsed && '-rotate-90',
							)}
						/>
					</button>
					{actions && (
						<div className="flex items-center gap-[8px] text-tertiary px-[12px]">
							{actions}
						</div>
					)}
				</div>

				<div
					className={cx(
						'rounded-t-[10px] border-t border-card-border bg-card flex flex-col min-h-0 overflow-x-auto px-[10px] pt-[10px]',
						isCollapsed && 'hidden',
					)}
				>
					{children}
				</div>
			</section>
		)
	}

	return (
		<section className="rounded-[10px] bg-card-header overflow-hidden">
			<div className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between w-full">
				<div className="w-full">
					<div className="flex items-center w-full gap-2 justify-between">
						<a
							id={title.toLowerCase().replaceAll(' ', '-')}
							href={`#${title.toLowerCase().replaceAll(' ', '-')}`}
							className="text-[14px] text-primary font-medium"
						>
							{title}
						</a>

						<p className="text-[12px] text-primary font-medium">
							{rightSideTitle}
						</p>
					</div>
					<div className="flex items-center w-full gap-2 justify-between">
						{description && (
							<p className="text-[12px] text-secondary">{description}</p>
						)}
						{rightSideDescription && (
							<p className="text-[12px] text-secondary">
								{rightSideDescription}
							</p>
						)}
					</div>
					{textGrid && (
						<div className="flex flex-row justify-between mt-1">
							{textGrid.map((item, index) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: textGrid is static and doesn't reorder
								<div key={index} className="text-xs gap-2 flex">
									{item.left && item.left}
									{item.right && item.right}
								</div>
							))}
						</div>
					)}
				</div>
				{actions}
			</div>
			<div className="bg-card p-2">{children}</div>
		</section>
	)
}
