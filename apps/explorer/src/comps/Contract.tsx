import type { Address } from 'ox'
import * as React from 'react'
import type { Abi } from 'viem'
import { ConnectWallet } from '#comps/ConnectWallet.tsx'
import { AbiViewer } from '#comps/ContractAbi.tsx'
import { ContractReader } from '#comps/ContractReader.tsx'
import { ContractWriter } from '#comps/ContractWriter.tsx'
import { cx } from '#cva.config.ts'
import { getContractAbi } from '#lib/domain/contracts.ts'
import { useCopy } from '#lib/hooks.ts'
import DownloadIcon from '~icons/lucide/download'
import ExternalLinkIcon from '~icons/lucide/external-link'

export function ContractTabContent(props: {
	address: Address.Address
	abi?: Abi
	docsUrl?: string
}) {
	const { address, docsUrl } = props

	const { copy: copyAbi, notifying: copiedAbi } = useCopy({ timeout: 2000 })

	const abi = props.abi ?? getContractAbi(address)

	const handleCopyAbi = React.useCallback(() => {
		if (!abi) return
		void copyAbi(JSON.stringify(abi, null, 2))
	}, [abi, copyAbi])

	const handleDownloadAbi = React.useCallback(() => {
		if (!abi || typeof window === 'undefined') return
		const json = JSON.stringify(abi, null, 2)
		const blob = new Blob([json], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = `${address}-abi.json`
		document.body.appendChild(anchor)
		anchor.click()
		document.body.removeChild(anchor)
		URL.revokeObjectURL(url)
	}, [abi, address])

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
		<div className="flex flex-col gap-3.5">
			{/* ABI Viewer */}
			<ContractFeatureCard
				title="Contract ABI"
				actions={
					<div className="flex gap-[8px]">
						{docsUrl && (
							<a
								href={docsUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="text-[12px] rounded-[6px] border border-card-border px-[10px] py-[6px] hover:bg-base-alt transition-colors inline-flex items-center gap-[4px]"
							>
								Docs
								<ExternalLinkIcon className="w-[12px] h-[12px]" />
							</a>
						)}
						<button
							type="button"
							onClick={handleDownloadAbi}
							className="text-[12px] rounded-[6px] border border-card-border px-[10px] py-[6px] hover:bg-base-alt transition-colors inline-flex items-center gap-[4px]"
						>
							<DownloadIcon className="w-[12px] h-[12px]" />
							Download
						</button>
					</div>
				}
			>
				<AbiViewer abi={abi} onCopy={handleCopyAbi} copied={copiedAbi} />
			</ContractFeatureCard>

			<div aria-hidden="true" className="border-b border-card-border" />

			{/* Read Contract Panel */}
			<ContractFeatureCard title="Read contract">
				<ContractReader address={address} abi={abi} docsUrl={docsUrl} />
			</ContractFeatureCard>

			<div aria-hidden="true" className="border-b border-card-border" />

			{/* Write Contract Panel */}
			<ContractFeatureCard
				title="Write contract"
				className="mb-4"
				actions={[<ConnectWallet key="connect-wallet" />]}
			>
				<ContractWriter address={address} abi={abi} />
			</ContractFeatureCard>
		</div>
	)
}

export function ContractFeatureCard(props: {
	title: string
	className?: string
	rightSideTitle?: string
	actions?: React.ReactNode
	children: React.ReactNode
	description?: React.ReactNode
	rightSideDescription?: string
	textGrid?: Array<{ left?: React.ReactNode; right?: React.ReactNode }>
}) {
	const {
		title,
		description,
		actions,
		children,
		rightSideDescription,
		rightSideTitle,
		textGrid,
		className,
	} = props
	return (
		<section
			className={cx('rounded-[10px] bg-card-header overflow-hidden', className)}
		>
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
			<div className="border-t border-card-border bg-card px-2.5">
				{children}
			</div>
		</section>
	)
}
