import { useQuery } from '@tanstack/react-query'
import type { Address } from 'ox'
import * as React from 'react'
import type { Abi } from 'viem'
import { Link } from '@tanstack/react-router'
import { useBytecode, usePublicClient } from 'wagmi'
import { Address as AddressComp } from '#comps/Address.tsx'
import { ConnectWallet } from '#comps/ConnectWallet.tsx'
import { AbiViewer } from '#comps/ContractAbi.tsx'
import { ContractReader } from '#comps/ContractReader.tsx'
import { SourceSection } from '#comps/ContractSource.tsx'
import { ContractWriter } from '#comps/ContractWriter.tsx'
import { cx } from '#lib/css'
import { ellipsis } from '#lib/chars.ts'
import type { ContractSource } from '#lib/domain/contract-source.ts'
import { autoloadAbi, getContractAbi } from '#lib/domain/contracts.ts'
import { getApiUrl } from '#lib/env.ts'
import {
	detectProxy,
	type ProxyInfo,
	type ProxyType,
} from '#lib/domain/proxy.ts'
import { isTip20Address } from '#lib/domain/tip20.ts'
import { useCopy, useDownload } from '#lib/hooks.ts'
import ChevronDownIcon from '~icons/lucide/chevron-down'
import CopyIcon from '~icons/lucide/copy'
import DownloadIcon from '~icons/lucide/download'
import ExternalLinkIcon from '~icons/lucide/external-link'

const proxyTypeUrls: Record<ProxyType, string> = {
	'EIP-1967': 'https://eips.ethereum.org/EIPS/eip-1967',
	'EIP-1822': 'https://eips.ethereum.org/EIPS/eip-1822',
	Beacon: 'https://eips.ethereum.org/EIPS/eip-1967#beacon-contract-address',
	Legacy: 'https://docs.openzeppelin.com/contracts/4.x/api/proxy',
}

function proxyTypeUrl(type: ProxyType | undefined): string {
	return type ? proxyTypeUrls[type] : proxyTypeUrls['EIP-1967']
}

function formatDate(timestamp: number): string {
	return new Date(timestamp * 1000).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	})
}

/**
 * Contract tab content - shows ABI and Source
 */
export function ContractTabContent(
	props: ContractTabContent.Props,
): React.JSX.Element {
	const { address, docsUrl, source } = props
	const isTip20 = isTip20Address(address)

	const { copy: copyAbi, notifying: copiedAbi } = useCopy({ timeout: 2_000 })

	const [deploymentExpanded, setDeploymentExpanded] = React.useState(true)
	const [abiExpanded, setAbiExpanded] = React.useState(false)
	const abi = props.abi ?? getContractAbi(address)

	const { data: metadataData } = useQuery<ContractTabContent.MetadataData>({
		queryKey: ['address-metadata', address],
		queryFn: async () => {
			const url = getApiUrl(`/api/address/metadata/${address}`)
			const response = await fetch(url)
			if (!response.ok) {
				return {
					createdTimestamp: null,
					createdTxHash: null,
					createdBy: null,
				} as const
			}
			return response.json()
		},
	})

	const { data: contractCreationData } =
		useQuery<ContractTabContent.CreationResponse>({
			queryKey: ['contract-creation', address],
			queryFn: async () => {
				const url = getApiUrl(`/api/contract/creation/${address}`)
				const response = await fetch(url)
				return response.json() as Promise<ContractTabContent.CreationResponse>
			},
			enabled: !metadataData?.createdTxHash || !metadataData?.createdBy,
			staleTime: 60_000,
		})

	const createdTimestamp =
		metadataData?.createdTimestamp ??
		(contractCreationData?.creation?.timestamp
			? Number(contractCreationData.creation.timestamp)
			: null)
	const createdTxHash =
		metadataData?.createdTxHash ?? contractCreationData?.creation?.hash ?? null
	const createdBy =
		metadataData?.createdBy ?? contractCreationData?.creation?.from ?? null
	const hasDeploymentInfo = Boolean(
		createdTimestamp || createdTxHash || createdBy,
	)

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
			{/* TIP-20 Banner */}
			{isTip20 && (
				<div className="flex flex-wrap items-center gap-x-[8px] gap-y-[4px] px-[16px] py-[10px] text-[13px] text-secondary border-b border-dashed border-distinct">
					<span className="whitespace-nowrap">TIP-20 Native Precompile</span>
					<span className="text-tertiary">·</span>
					<a
						href="https://docs.tempo.xyz/protocol/tip20/spec#tip20-1"
						target="_blank"
						rel="noopener noreferrer"
						className="text-accent hover:underline whitespace-nowrap"
					>
						Spec
					</a>
					<a
						href="https://github.com/tempoxyz/tempo/tree/main/crates/precompiles/src/tip20"
						target="_blank"
						rel="noopener noreferrer"
						className="text-accent hover:underline whitespace-nowrap"
					>
						Rust
					</a>
				</div>
			)}

			{/* Source Section */}
			{source && <SourceSection {...source} docsUrl={docsUrl} />}

			{/* Deployment Section */}
			{hasDeploymentInfo && (
				<CollapsibleSection
					first={!isTip20 && !source}
					title="Deployment"
					expanded={deploymentExpanded}
					onToggle={() => setDeploymentExpanded(!deploymentExpanded)}
				>
					<div className="px-[18px] py-[12px] flex flex-col gap-[8px] text-[13px]">
						<DeploymentRow
							label="Created"
							value={
								createdTimestamp ? formatDate(createdTimestamp) : undefined
							}
						/>
						{createdBy && (
							<div className="flex items-center justify-between gap-[12px]">
								<span className="text-secondary">Created By</span>
								<AddressComp address={createdBy} className="text-[13px]" />
							</div>
						)}
						{createdTxHash && (
							<div className="flex items-center justify-between gap-[12px]">
								<span className="text-secondary">Creation Tx</span>
								<Link
									to="/tx/$hash"
									params={{ hash: createdTxHash }}
									className="text-[13px] font-mono text-accent hover:underline"
								>
									{createdTxHash.slice(0, 10)}…{createdTxHash.slice(-8)}
								</Link>
							</div>
						)}
					</div>
				</CollapsibleSection>
			)}

			{/* ABI Section */}
			<CollapsibleSection
				first={!isTip20 && !source && !hasDeploymentInfo}
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
						{docsUrl && !source && (
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

			{/* Bytecode Section - hidden for TIP-20 */}
			{!isTip20 && <BytecodeSection address={address} />}
		</div>
	)
}

export declare namespace ContractTabContent {
	type Props = {
		address: Address.Address
		abi?: Abi | undefined
		docsUrl?: string | undefined
		source?: ContractSource | undefined
	}

	type MetadataData = {
		createdTimestamp: number | null
		createdTxHash: `0x${string}` | null
		createdBy: Address.Address | null
	}

	type CreationResponse = {
		creation: {
			timestamp: string
			hash: `0x${string}` | null
			from: Address.Address | null
		} | null
		error: string | null
	}
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
					<div className="flex-1 min-w-0 flex items-stretch justify-end gap-[8px] text-tertiary px-[12px]">
						{actions}
					</div>
				)}
			</div>
			<div className={cx(!expanded && 'hidden')}>{children}</div>
		</div>
	)
}

function DeploymentRow(props: {
	label: string
	value: string | undefined
}): React.JSX.Element {
	return (
		<div className="flex items-center justify-between gap-[12px]">
			<span className="text-secondary">{props.label}</span>
			<span className="text-primary">
				{props.value ?? <span className="text-tertiary">&mdash;</span>}
			</span>
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
					<a
						href={proxyTypeUrl(proxyInfo?.type)}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-[4px] px-[6px] py-[2px] bg-accent/20 text-accent hover:bg-accent/30 rounded text-[11px] font-medium transition-colors"
					>
						{proxyInfo?.type} Proxy
						<ExternalLinkIcon className="size-[10px]" />
					</a>
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
