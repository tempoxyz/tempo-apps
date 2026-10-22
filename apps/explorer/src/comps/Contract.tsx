import {
	Button,
	Callout,
	CopyButton,
	Empty,
	Rows,
	Skeleton,
	Spinner,
	Tag,
	style,
} from '@tempoxyz/ds'
import { Download, ExternalLink } from '@tempoxyz/ds/icons'
import type { Address } from 'ox'
import * as React from 'react'
import type { Abi } from 'viem'
import { useBytecode, usePublicClient } from 'wagmi'
import { cx } from 'zyzz'
import { Address as AddressLink } from '#comps/Address'
import { ConnectWallet } from '#comps/ConnectWallet.tsx'
import { AbiViewer } from '#comps/ContractAbi.tsx'
import { IconAction } from '#comps/ContractFunction'
import { ContractReader } from '#comps/ContractReader.tsx'
import { SourceSection } from '#comps/ContractSource.tsx'
import { ContractWriter } from '#comps/ContractWriter.tsx'
import type { ContractSource } from '#lib/domain/contract-source.ts'
import {
	autoloadAbi,
	getContractAbi,
	getInputFunctions,
	getNoInputFunctions,
	getWriteFunctions,
	isInferredAbi,
	resolveInteractAbi,
} from '#lib/domain/contracts.ts'
import {
	detectProxy,
	type ProxyInfo,
	type ProxyType,
} from '#lib/domain/proxy.ts'
import { isTip20Address } from '#lib/domain/tip20.ts'
import { useDownload } from '#lib/hooks.ts'
import { link, linkHover } from '#styles/explorer'

const proxyTypeUrls: Record<ProxyType, string> = {
	'EIP-1967': 'https://eips.ethereum.org/EIPS/eip-1967',
	'EIP-1822': 'https://eips.ethereum.org/EIPS/eip-1822',
	Beacon: 'https://eips.ethereum.org/EIPS/eip-1967#beacon-contract-address',
	Legacy: 'https://docs.openzeppelin.com/contracts/4.x/api/proxy',
}

function proxyTypeUrl(type: ProxyType | undefined): string {
	return type ? proxyTypeUrls[type] : proxyTypeUrls['EIP-1967']
}

/**
 * One headed group of a tab, such as Read or Bytecode: a title with an
 * optional description and actions, then its content.
 */
export function ContractSection(
	props: ContractSection.Props,
): React.JSX.Element {
	const { actions, children, description, title } = props
	const titleId = React.useId()
	return (
		<section aria-labelledby={titleId} {...styles.section()}>
			<div {...styles.sectionHeader()}>
				<div {...styles.sectionHeading()}>
					<h3 id={titleId} {...styles.sectionTitle()}>
						{title}
					</h3>
					{description && <p {...styles.sectionDescription()}>{description}</p>}
				</div>
				{actions && <div {...styles.sectionActions()}>{actions}</div>}
			</div>
			{children}
		</section>
	)
}

export declare namespace ContractSection {
	type Props = {
		/** Controls at the end of the header. */
		actions?: React.ReactNode
		children: React.ReactNode
		/** One line under the title, such as a count. */
		description?: React.ReactNode
		title: React.ReactNode
	}
}

/** The TIP-20 precompile's spec and source, as a section description. */
export function Tip20Links(): React.JSX.Element {
	return (
		<>
			TIP-20 native precompile ·{' '}
			<a
				href="https://tempo.xyz/developers/docs/protocol/tip20/spec/#tip20"
				target="_blank"
				rel="noopener noreferrer"
				{...cx(link(), linkHover())}
			>
				Spec
			</a>{' '}
			·{' '}
			<a
				href="https://github.com/tempoxyz/tempo/tree/main/crates/precompiles/src/tip20"
				target="_blank"
				rel="noopener noreferrer"
				{...cx(link(), linkHover())}
			>
				Rust source
			</a>
		</>
	)
}

function InferredAbiNotice({ abi }: { abi: Abi }): React.JSX.Element | null {
	if (!isInferredAbi(abi)) return null
	return (
		<Callout intent="warning" role="note" size="small">
			<Callout.Icon />
			<Callout.Content>
				Inferred ABI: function names, read/write classifications, and return
				types may be incomplete or incorrect. Verify the contract source for an
				accurate ABI.
			</Callout.Content>
		</Callout>
	)
}

/** Loading or missing ABI, in place of a tab's sections. */
function AbiState(props: { loading: boolean }): React.JSX.Element {
	if (props.loading)
		return (
			<div aria-busy {...styles.state()}>
				<Spinner aria-label="Loading contract information" />
			</div>
		)
	return (
		<Empty.Root>
			<Empty.Title>No ABI available</Empty.Title>
			<Empty.Description>
				This contract has no verified source or known ABI.
			</Empty.Description>
		</Empty.Root>
	)
}

function pluralize(count: number, noun: string): string {
	return `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`
}

/**
 * Contract tab content - shows Source, ABI and Bytecode
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

	const abi = props.abi ?? getContractAbi(address)
	const json = React.useMemo(() => JSON.stringify(abi, null, 2), [abi])

	const { download: downloadAbi } = useDownload({
		contentType: 'application/json',
		value: json,
		filename: `${address.toLowerCase()}-abi.json`,
	})

	if (!abi) return <AbiState loading={Boolean(props.isLoadingContractInfo)} />

	const functions = abi.filter((item) => item.type === 'function').length
	const events = abi.filter((item) => item.type === 'event').length

	return (
		<div {...styles.tabContent()}>
			{source && (
				<ContractSection
					title="Source code"
					description={
						isTip20 ? (
							<Tip20Links />
						) : source.kind === 'verified' ? (
							`Verified · ${source.compilation.compiler} ${source.compilation.compilerVersion}`
						) : (
							'Native precompile source'
						)
					}
				>
					<SourceSection {...source} docsUrl={docsUrl} />
				</ContractSection>
			)}

			<ContractSection
				title="ABI"
				description={
					!source && isTip20 ? (
						<Tip20Links />
					) : (
						`${pluralize(functions, 'function')} · ${pluralize(events, 'event')}`
					)
				}
				actions={
					<>
						{docsUrl && !source && (
							<Button.Link
								href={docsUrl}
								target="_blank"
								rel="noopener noreferrer"
								size="small"
								variant="text"
							>
								Docs
								<ExternalLink />
							</Button.Link>
						)}
						<IconAction
							icon={Download}
							label="Download ABI"
							onClick={downloadAbi}
						/>
						<CopyButton aria-label="Copy ABI" value={json} />
					</>
				}
			>
				<InferredAbiNotice abi={abi} />
				<AbiViewer abi={abi} />
			</ContractSection>

			{/* TIP-20 precompiles have no bytecode. */}
			{!isTip20 && <BytecodeSection address={address} />}
		</div>
	)
}

/**
 * Bytecode section - shows raw bytecode
 */
function BytecodeSection(props: { address: Address.Address }) {
	const { address } = props

	const { data: bytecode } = useBytecode({ address })

	const { download: downloadBytecode } = useDownload({
		value: bytecode ?? '',
		contentType: 'text/plain',
		filename: `${address.toLowerCase()}-bytecode.txt`,
	})

	return (
		<ContractSection
			title="Bytecode"
			description={
				bytecode
					? `${pluralize((bytecode.length - 2) / 2, 'byte')} deployed`
					: 'Deployed code'
			}
			actions={
				<>
					<IconAction
						disabled={!bytecode}
						icon={Download}
						label="Download bytecode"
						onClick={downloadBytecode}
					/>
					<CopyButton
						aria-label="Copy bytecode"
						disabled={!bytecode}
						value={bytecode ?? ''}
					/>
				</>
			}
		>
			{bytecode ? (
				<div {...styles.well()}>
					<pre {...styles.bytecode()}>{bytecode}</pre>
				</div>
			) : (
				<Skeleton
					aria-label="Loading bytecode"
					{...styles.bytecodeSkeleton()}
				/>
			)}
		</ContractSection>
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

	if (props.isLoadingContractInfo || isLoadingProxy || !abi)
		return (
			<AbiState
				loading={Boolean(props.isLoadingContractInfo || isLoadingProxy)}
			/>
		)

	const isProxy = proxyInfo?.isProxy ?? false
	const implementationAddress = proxyInfo?.implementationAddress
	const hasProxyFunctions = proxyAbi && proxyAbi.length > 0
	const readCount =
		getNoInputFunctions(abi).length + getInputFunctions(abi).length
	const writeCount = getWriteFunctions(abi).length

	return (
		<div {...styles.tabContent()}>
			{isProxy && implementationAddress && (
				<ContractSection
					title="Proxy"
					description="Reads and writes go through the proxy to its implementation."
				>
					<Rows dividers="full">
						<Rows.Row spacing="none">
							<Rows.Label>Standard</Rows.Label>
							<Tag
								render={
									// biome-ignore lint/a11y/useAnchorContent: Tag renders its children inside the link.
									<a
										href={proxyTypeUrl(proxyInfo?.type)}
										target="_blank"
										rel="noopener noreferrer"
									/>
								}
								intent="neutral"
								size="small"
							>
								{proxyInfo?.type}
								<ExternalLink />
							</Tag>
						</Rows.Row>
						<Rows.Row spacing="none">
							<Rows.Label>Implementation</Rows.Label>
							<span {...styles.address()}>
								<AddressLink
									address={implementationAddress}
									align="end"
									search={{ tab: 'interact' }}
								/>
							</span>
						</Rows.Row>
					</Rows>
				</ContractSection>
			)}

			<InferredAbiNotice abi={abi} />

			<ContractSection
				title={isProxy ? 'Read via proxy' : 'Read'}
				description={`${pluralize(readCount, 'function')} · No wallet needed`}
			>
				<ContractReader address={address} abi={abi} />
			</ContractSection>

			<ContractSection
				title={isProxy ? 'Write via proxy' : 'Write'}
				description={`${pluralize(writeCount, 'function')} · Simulate a call before you sign it`}
				actions={<ConnectWallet />}
			>
				<ContractWriter address={address} abi={abi} />
			</ContractSection>

			{isProxy && hasProxyFunctions && (
				<ContractSection
					title="Proxy contract functions"
					description="Functions defined on the proxy contract itself, not the implementation."
				>
					<InferredAbiNotice abi={proxyAbi} />
					<ContractReader address={address} abi={proxyAbi} />
					<ContractWriter address={address} abi={proxyAbi} />
				</ContractSection>
			)}
		</div>
	)
}

namespace styles {
	export const state = style({
		alignItems: 'center',
		display: 'flex',
		justifyContent: 'center',
		minHeight: '160',
	})

	export const tabContent = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '32',
	})

	export const section = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		minWidth: '0',
	})

	export const sectionHeader = style({
		alignItems: 'center',
		columnGap: '16',
		display: 'flex',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
		rowGap: '8',
	})

	export const sectionHeading = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		minWidth: '0',
	})

	export const sectionTitle = style({
		color: 'foreground',
		typography: 'heading.16',
	})

	export const sectionDescription = style({
		color: 'gray.900',
		typography: 'copy.13',
	})

	export const sectionActions = style({
		alignItems: 'center',
		display: 'flex',
		gap: '4',
	})

	// A bordered well for code, inside the tab's card.
	export const well = style({
		borderColor: 'grayAlpha.200',
		borderRadius: '12',
		borderStyle: 'solid',
		borderWidth: '1',
		overflow: 'hidden',
	})

	export const bytecodeSkeleton = style({ height: '128' })

	export const bytecode = style({
		color: 'foreground',
		maxHeight: '240px !custom',
		overflow: 'auto',
		padding: '16',
		typography: 'copy.13.mono',
		whiteSpace: 'pre-wrap',
		wordBreak: 'break-all',
	})

	// Rows guidance: cap a Hex so it ends with the other values.
	export const address = style({
		display: 'inline-flex',
		maxWidth: '12rem !custom',
		minWidth: '0',
	})
}
