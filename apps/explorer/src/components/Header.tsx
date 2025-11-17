import { Link, useMatch, useNavigate } from '@tanstack/react-router'
import * as React from 'react'
import { useChains, useWatchBlockNumber } from 'wagmi'
import Music4 from '~icons/lucide/music-4'
import SquareSquare from '~icons/lucide/square-square'
import { ExploreInput } from './ExploreInput'

export function Header(props: Header.Props) {
	const { initialBlockNumber } = props
	const navigate = useNavigate()
	const [inputValue, setInputValue] = React.useState('')
	const [isNavigating, setIsNavigating] = React.useState(false)

	const txMatch = useMatch({ from: '/_layout/tx/$hash', shouldThrow: false })
	const accountMatch = useMatch({
		from: '/_layout/account/$address',
		shouldThrow: false,
	})
	const hash = (txMatch?.params as { hash: string | undefined })?.hash
	const address = (accountMatch?.params as { address: string | undefined })
		?.address

	const showInput = Boolean(hash || address)

	React.useEffect(() => {
		if (hash || address) {
			setInputValue('')
			setIsNavigating(false)
		}
	}, [hash, address])

	return (
		<header className="@container">
			<div className="px-[24px] @min-[1240px]:pt-[48px] @min-[1240px]:px-[84px] flex items-center justify-between min-h-16 pt-[36px] select-none relative z-1">
				<div className="flex items-center gap-[12px] relative z-1 h-[28px]">
					<Link to="/" className="flex items-center press-down py-[4px]">
						<Header.TempoWordmark />
					</Link>
					<Header.NetworkBadge />
				</div>
				{showInput && (
					<div className="absolute left-0 right-0 justify-center hidden @min-[1240px]:flex">
						<ExploreInput
							value={inputValue}
							onChange={setInputValue}
							disabled={isNavigating}
							onActivate={({ value, type }) => {
								if (type === 'hash') {
									if (hash !== value) setIsNavigating(true)
									navigate({
										params: { hash: value },
										to: '/tx/$hash',
									})
									return
								}
								if (type === 'address') {
									if (address !== value) setIsNavigating(true)
									navigate({
										params: { address: value },
										to: '/account/$address',
									})
									return
								}
							}}
						/>
					</div>
				)}
				<div className="relative z-1">
					<Header.BlockNumber initial={initialBlockNumber} />
				</div>
			</div>
		</header>
	)
}

export namespace Header {
	export interface Props {
		initialBlockNumber?: bigint
	}

	export function BlockNumber(props: BlockNumber.Props) {
		const { initial } = props
		const ref = React.useRef<HTMLSpanElement>(null)
		useWatchBlockNumber({
			pollingInterval: 1000,
			onBlockNumber: (blockNumber) => {
				if (ref.current) ref.current.textContent = String(blockNumber)
			},
		})
		return (
			<div className="flex items-center gap-[6px] text-[15px] font-medium text-secondary">
				<SquareSquare className="size-[18px] text-accent" />
				<div className="text-nowrap">
					<span className="@min-[1240px]:inline hidden">Block </span>
					<span className="text-primary font-medium tabular-nums min-w-[6ch] inline-block">
						<span ref={ref}>{initial ? String(initial) : '…'}</span>
					</span>
				</div>
			</div>
		)
	}

	export namespace BlockNumber {
		export interface Props {
			initial?: bigint
		}
	}

	export function NetworkBadge() {
		const [chain] = useChains()
		const network = chain.name.match(/Tempo (.+)/)?.[1]
		if (!network) return null
		return (
			<div className="flex items-center gap-[4px] px-[8px] h-[28px] border-[1px] border-distinct bg-base-alt text-base-content rounded-[14px] text-[14px] font-medium">
				<Music4 width={14} height={14} className="text-accent" />
				{network}
			</div>
		)
	}

	export function TempoWordmark(props: TempoWordmark.Props) {
		const { className } = props

		const baseClass = 'h-6 w-auto fill-current text-primary'
		const classes = className ? `${baseClass} ${className}` : baseClass

		return (
			<svg
				aria-label="Tempo"
				viewBox="0 0 102 25"
				className={classes}
				role="img"
			>
				<path d="M95.1 16.1c1.74 0 3.35-1.25 3.35-3.73 0-2.49-1.6-3.74-3.34-3.74-1.74 0-3.34 1.25-3.34 3.74 0 2.48 1.6 3.74 3.34 3.74Zm0-10.7c3.93 0 6.9 2.9 6.9 6.97a6.73 6.73 0 0 1-6.9 6.97 6.75 6.75 0 0 1-6.88-6.97A6.75 6.75 0 0 1 95.1 5.4ZM77.34 24.01h-3.56V5.8h3.45v1.6c.59-1.01 2.06-1.9 4.03-1.9 3.85 0 6.07 2.94 6.07 6.84s-2.49 6.92-6.2 6.92c-1.82 0-3.15-.72-3.8-1.6V24Zm6.49-11.64c0-2.33-1.45-3.69-3.26-3.69-1.82 0-3.29 1.36-3.29 3.69 0 2.32 1.47 3.71 3.29 3.71 1.81 0 3.26-1.36 3.26-3.71ZM56 18.94h-3.56V5.8h3.39v1.6c.72-1.28 2.4-1.98 3.85-1.98 1.79 0 3.23.78 3.9 2.2a4.57 4.57 0 0 1 4.16-2.2c2.43 0 4.76 1.47 4.76 5v8.52h-3.45v-7.8c0-1.42-.7-2.48-2.32-2.48-1.52 0-2.43 1.17-2.43 2.59v7.69h-3.53v-7.8c0-1.42-.72-2.48-2.32-2.48-1.6 0-2.46 1.14-2.46 2.59v7.69Zm-14.13-8.07h5.87c-.05-1.3-.9-2.59-2.93-2.59a2.84 2.84 0 0 0-2.94 2.6Zm6.22 3.42 2.97.88c-.67 2.27-2.75 4.17-5.99 4.17-3.6 0-6.78-2.6-6.78-7.03 0-4.2 3.1-6.92 6.46-6.92 4.06 0 6.5 2.6 6.5 6.82 0 .5-.06 1.04-.06 1.1h-9.4c.08 1.73 1.55 2.98 3.31 2.98 1.66 0 2.56-.83 3-2Z" />
				<path d="M41.08 3.5H35.1v15.44h-3.71V3.5H25.4V0h15.68v3.5Z" />
				<path
					fillRule="evenodd"
					clipRule="evenodd"
					d="M18.96 18.95H0V.01h18.96v18.94ZM6.46 5.26a.27.27 0 0 0-.25.19l-.82 2.44c-.03.1.04.19.13.19H7.9c.1 0 .16.09.13.18l-1.75 5.25c-.03.1.04.19.14.19h2.53c.12 0 .22-.08.26-.19l1.75-5.25a.27.27 0 0 1 .25-.18h2.37c.12 0 .22-.08.26-.19l.81-2.44a.14.14 0 0 0-.13-.19H6.46Z"
				/>
			</svg>
		)
	}

	export namespace TempoWordmark {
		export interface Props {
			className?: string
		}
	}
}
