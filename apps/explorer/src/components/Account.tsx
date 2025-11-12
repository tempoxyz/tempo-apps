import { ClientOnly, getRouteApi } from '@tanstack/react-router'
import type { Address } from 'ox'
import { RelativeTime } from '#components/RelativeTime'
import { cx } from '#cva.config.ts'
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

	return (
		<article
			className={cx(
				'w-full sm:max-w-[400px] max-w-full',
				'overflow-hidden rounded-xl border border-primary/10 bg-primary',
				className,
			)}
		>
			<div className={cx('px-4 h-10 flex items-center gap-6')}>
				<h2 className="max-[480px]:text-xs font-medium uppercase tracking-[0.15em] text-tertiary">
					Account
				</h2>
			</div>

			<div
				className={cx(
					'grid grid-cols-[repeat(2,1fr)] grid-rows-[auto_auto_auto] gap-x-0 gap-y-0 bg-surface rounded-t-lg',
					'divide-dashed divide-black [&>*:not(:last-child)]:border-b-2 [&>*:not(:last-child)]:border-black-white/10',
				)}
			>
				{/* Account / Address */}
				<div
					style={{ gridArea: '1 / 1 / 2 / 3' }}
					className="border-b border-dashed border-black-white/10"
				>
					<div
						className={cx(
							'px-4 text-tertiary flex flex-row items-center gap-2 pt-2',
						)}
					>
						<p className="text-[12px] max-[480px]:text-[10px]">Address</p>
						<CopyIcon className="size-4 max-[480px]:size-3" />
					</div>

					<span className="font-mono text-sm max-[480px]:text-xs tracking-widest px-4 pt-2 pb-4 block break-all">
						{address}
					</span>
				</div>

				{/* Created date */}
				<div
					style={{ gridArea: '2 / 2 / 3 / 3' }}
					className=" flex flex-row items-center justify-between gap-2 py-4 px-2.5 border-l border-dashed border-black-white/10 border-r-transparent text-sm max-[480px]:text-xs"
				>
					<span className="text-tertiary">Created</span>
					<ClientOnly fallback={<span className="text-tertiary">…</span>}>
						{createdTimestamp ? (
							<RelativeTime timestamp={createdTimestamp} />
						) : (
							<span className="text-tertiary">…</span>
						)}
					</ClientOnly>
				</div>

				{/* Active ago */}
				<div
					className="flex flex-row items-center justify-between gap-2 py-4 px-2.5 text-sm max-[480px]:text-xs"
					style={{
						gridArea: '2 / 1 / 3 / 2',
					}}
				>
					<span className="text-tertiary">Active</span>
					<ClientOnly fallback={<span className="text-tertiary">…</span>}>
						{lastActivityTimestamp ? (
							<RelativeTime timestamp={lastActivityTimestamp} />
						) : (
							<span className="text-tertiary">…</span>
						)}
					</ClientOnly>
				</div>

				{/* Balance */}
				<div
					style={{ gridArea: '3 / 1 / 4 / 3' }}
					className="border-t border-dashed border-black-white/10 flex flex-row items-center justify-between gap-2 py-4 px-2.5 text-sm max-[480px]:text-xs"
				>
					<span className="text-tertiary">Holdings</span>
					<ClientOnly fallback={<span className="text-tertiary">…</span>}>
						{totalValue !== undefined ? (
							<span>${totalValue.toFixed(2)}</span>
						) : (
							<span className="text-tertiary">…</span>
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
