import { ClientOnly, getRouteApi } from '@tanstack/react-router'
import type { Address } from 'ox'
import { RelativeTime } from '#components/RelativeTime.tsx'
import { cx } from '#cva.config.ts'
import { useCopy, useMediaQuery } from '#lib/hooks.ts'
import CopyIcon from '~icons/lucide/copy'

const Route = getRouteApi('/_layout/account/$address')

export function AccountCard(props: AccountCard.Props) {
	const params = Route.useParams()
	const {
		address = params.address,
		className,
		createdTimestamp,
		lastActivityTimestamp,
		totalValue,
	} = props

	const { copy, notifying } = useCopy()
	const isMobile = useMediaQuery('(max-width: 1239px)')

	return (
		<article
			className={cx(
				'font-mono',
				isMobile ? 'w-full' : 'w-fit',
				'rounded-[10px] border border-card-border bg-card-header overflow-hidden',
				'shadow-[0px_4px_44px_rgba(0,0,0,0.05)]',
				className,
			)}
		>
			<h1 className="text-[13px] uppercase text-tertiary px-[18px] pt-[10px] pb-[8px] select-none">
				Account
			</h1>

			<div className="rounded-t-[10px] border-t border border-card-border bg-card -mb-px -mx-px">
				<div className="px-[18px] py-[18px] border-b border-dashed border-card-border">
					<button
						type="button"
						onClick={() => copy(address)}
						className="w-full text-left cursor-pointer press-down text-tertiary"
						title={address}
					>
						<div className="flex items-center gap-[8px] mb-[8px]">
							<span className="text-[13px] font-normal capitalize">
								Address
							</span>
							<div className="relative flex items-center">
								<CopyIcon className="w-[12px] h-[12px]" />
								{notifying && (
									<span className="absolute left-[calc(100%+8px)] text-[13px] leading-[16px]">
										copied
									</span>
								)}
							</div>
						</div>
						<p className="text-[14px] font-normal leading-[17px] tracking-[0.02em] text-primary break-all max-w-[22ch]">
							{address}
						</p>
					</button>
				</div>

				<div className="px-[18px] py-[12px] border-b border-dashed border-card-border flex items-center justify-between">
					<span className="text-[13px] font-normal capitalize text-tertiary">
						Active
					</span>
					<ClientOnly
						fallback={<span className="text-tertiary text-[13px]">…</span>}
					>
						{lastActivityTimestamp ? (
							<RelativeTime
								timestamp={lastActivityTimestamp}
								className="text-[13px] text-primary"
							/>
						) : (
							<span className="text-tertiary text-[13px]">…</span>
						)}
					</ClientOnly>
				</div>

				<div className="px-[18px] py-[12px] border-b border-dashed border-card-border flex items-center justify-between">
					<span className="text-[13px] font-normal capitalize text-tertiary">
						Holdings
					</span>
					<ClientOnly
						fallback={<span className="text-tertiary text-[13px]">…</span>}
					>
						{totalValue !== undefined ? (
							<span className="text-[13px] text-primary">
								${totalValue.toFixed(2)}
							</span>
						) : (
							<span className="text-tertiary text-[13px]">…</span>
						)}
					</ClientOnly>
				</div>

				<div className="px-[18px] py-[12px] flex items-center justify-between">
					<span className="text-[13px] font-normal capitalize text-tertiary">
						Created
					</span>
					<ClientOnly
						fallback={<span className="text-tertiary text-[13px]">…</span>}
					>
						{createdTimestamp ? (
							<RelativeTime
								timestamp={createdTimestamp}
								className="text-[13px] text-primary"
							/>
						) : (
							<span className="text-tertiary text-[13px]">…</span>
						)}
					</ClientOnly>
				</div>
			</div>
		</article>
	)
}

export declare namespace AccountCard {
	type Props = {
		address?: Address.Address | undefined
		className?: string
		lastActivityTimestamp?: bigint | undefined
		createdTimestamp?: bigint | undefined
		totalValue?: number | undefined
	}
}
