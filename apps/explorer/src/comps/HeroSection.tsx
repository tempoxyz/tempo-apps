import { useNavigate } from '@tanstack/react-router'
import * as React from 'react'
import { ExploreInput } from '#comps/ExploreInput'
import { cx } from '#lib/css'
import ArrowUpRightIcon from '~icons/lucide/arrow-up-right'

/**
 * Cycling action lines. Each entry pairs a typewriter headline with a
 * matching example "event description" rendered below the search input.
 * Phrasing mirrors the dynamic OG image templates so the same rough
 * shape (action / asset / connector / address) renders consistently.
 */
const ACTIONS: ReadonlyArray<HeroAction> = [
	{
		headline: 'Interact with code',
		event: 'Send 1,000.00 TEST to 0xAb1c…Cc3e',
		when: '3s',
	},
	{
		headline: 'Trace token flows',
		event: 'Mint 500 USDC.e to 0xdEad…F00d',
		when: '12s',
	},
	{
		headline: 'Inspect every block',
		event: 'Block 15,242,460 sealed by 0xfeec…0000',
		when: '1m',
	},
	{
		headline: 'Audit every transfer',
		event: 'Burn 100 EURC.e from 0xC0fe…Ba5e',
		when: '4m',
	},
	{
		headline: 'Search the network',
		event: 'Approve 1.5M pathUSD for 0x20FC…0000',
		when: '11m',
	},
] as const

type HeroAction = {
	headline: string
	event: string
	when: string
}

export function HeroSection(props: HeroSection.Props): React.JSX.Element {
	const { searchValue, onSearchChange } = props
	const navigate = useNavigate()
	const { typed, currentIndex, isPaused } = useTypewriter(
		ACTIONS.map((a) => a.headline),
	)

	const current = ACTIONS[currentIndex] ?? ACTIONS[0]

	return (
		<section className="relative isolate -mx-4 mb-6 overflow-hidden rounded-[12px] bg-base-background">
			<HeroVideoBackground />
			<div
				className="pointer-events-none absolute inset-0 z-[1]"
				style={{
					backgroundImage:
						'radial-gradient(ellipse at center, color-mix(in srgb, var(--color-base-background) 38%, transparent) 0%, color-mix(in srgb, var(--color-base-background) 32%, transparent) 35%, transparent 70%)',
				}}
				aria-hidden
			/>
			<div className="relative z-10 flex flex-col items-center text-center px-4 pt-[6svh] pb-8 sm:pt-[10svh] sm:pb-10 motion-safe:animate-[fadeIn_500ms_ease-out_both]">
				<h1 className="text-[40px] sm:text-[56px] font-semibold tracking-[-0.02em] leading-[1.05] text-primary inline-flex items-center justify-center min-h-[1.1em]">
					<span>{typed}</span>
					<span
						className={cx(
							'inline-block ml-[2px] w-[2px] h-[0.85em] bg-primary translate-y-[3px]',
							isPaused ? 'animate-pulse' : 'opacity-90',
						)}
						aria-hidden
					/>
				</h1>
				<p className="mt-3 text-[15px] text-secondary max-w-[460px]">
					Dive into Tempo's blocks, transactions, assets, and contracts.
				</p>
				<div className="mt-7 w-full max-w-[560px]">
					<ExploreInput
						autoFocus={false}
						size="large"
						wide
						className="bg-card/85 backdrop-blur-[2px] rounded-full! pl-[20px]! pr-[60px]!"
						value={searchValue}
						onChange={onSearchChange}
						onActivate={(data) => {
							if (data.type === 'block') {
								navigate({ to: '/block/$id', params: { id: data.value } })
								return
							}
							if (data.type === 'hash') {
								navigate({ to: '/tx/$hash', params: { hash: data.value } })
								return
							}
							if (data.type === 'token') {
								navigate({
									to: '/token/$address',
									params: { address: data.value },
								})
								return
							}
							if (data.type === 'address') {
								navigate({
									to: '/address/$address',
									params: { address: data.value },
								})
							}
						}}
					/>
				</div>
				<HeroExamplePill key={current.event} action={current} />
			</div>
		</section>
	)
}

export declare namespace HeroSection {
	type Props = {
		searchValue: string
		onSearchChange: (value: string) => void
	}
}

/**
 * Background looping video. Source asset is dark-mode-friendly (white
 * wireframe on black). The page renders dark mode using the source
 * untouched; in light mode we invert + hue-rotate 180° so the wireframe
 * reads as black on white without shipping a second video file.
 */
function HeroVideoBackground(): React.JSX.Element {
	return (
		<div
			className="absolute inset-0 -z-0 pointer-events-none select-none"
			style={{ backgroundColor: 'var(--hero-video-bg)' }}
		>
			<video
				className="absolute inset-0 size-full object-cover"
				style={{ filter: 'var(--hero-video-filter)' }}
				autoPlay
				loop
				muted
				playsInline
				preload="auto"
				aria-hidden
			>
				<source src="/landing-hero/animation.mp4" type="video/mp4" />
			</video>
			{/* Soft radial fade so the video edges blend into the page bg in
			    both themes (no harsh rectangular cut). */}
			<div
				className="absolute inset-0"
				style={{
					backgroundImage:
						'radial-gradient(ellipse at center, transparent 55%, var(--color-base-background) 100%)',
				}}
				aria-hidden
			/>
		</div>
	)
}

/**
 * Small mock event pill that cross-fades whenever the typewriter advances
 * to a new action (the parent passes a fresh `key` so we get an unmount/
 * mount-driven enter animation).
 */
function HeroExamplePill(props: { action: HeroAction }): React.JSX.Element {
	const { action } = props
	return (
		<div className="mt-3 motion-safe:animate-[fadeIn_400ms_ease-out_both]">
			<div className="inline-flex items-center gap-2 rounded-full border border-card-border bg-card/80 backdrop-blur-sm pl-4 pr-3 py-1.5 text-[12px] text-secondary shadow-[0_4px_18px_-12px_rgba(0,0,0,0.18)]">
				<EventDescription text={action.event} />
				<span className="text-tertiary tabular-nums">{action.when}</span>
				<ArrowUpRightIcon className="size-3 text-tertiary" />
			</div>
		</div>
	)
}

/**
 * Lightweight clone of [apps/og/src/ui.tsx](apps/og/src/ui.tsx)'s
 * `parseEventDetails`: splits an event description into action / asset /
 * connector / address segments for differentiated styling.
 */
function EventDescription(props: { text: string }): React.JSX.Element {
	const groups = React.useMemo(
		() => parseEventDetails(props.text),
		[props.text],
	)
	return (
		<span className="inline-flex flex-wrap items-center gap-x-1">
			{groups.map((g, i) => (
				<span
					key={i}
					className={cx(
						g.type === 'asset' && 'text-positive font-mono',
						g.type === 'address' && 'text-accent font-mono',
						g.type === 'normal' && 'text-primary font-medium',
					)}
				>
					{g.text}
				</span>
			))}
		</span>
	)
}

type Group = { text: string; type: 'normal' | 'asset' | 'address' }

function parseEventDetails(details: string): Group[] {
	const groups: Group[] = []
	const words = details.split(' ')
	let i = 0
	while (i < words.length) {
		const word = words[i] ?? ''
		const next = words[i + 1] ?? ''
		if (
			word.startsWith('0x') ||
			(word.includes('…') && /[0-9a-fA-F]/.test(word))
		) {
			groups.push({ text: word, type: 'address' })
			i++
			continue
		}
		if (
			/^[\d.,]+$/.test(word) &&
			next &&
			!['for', 'to', 'from', 'on', 'by'].includes(next)
		) {
			groups.push({ text: `${word} ${next}`, type: 'asset' })
			i += 2
			continue
		}
		groups.push({ text: word, type: 'normal' })
		i++
	}
	return groups
}

/**
 * Typewriter loop:
 * - type each char ~50ms
 * - pause ~1.8s when full string shown
 * - delete ~30ms/char
 * - advance to next phrase, repeat
 */
function useTypewriter(phrases: ReadonlyArray<string>): {
	typed: string
	currentIndex: number
	isPaused: boolean
} {
	const [index, setIndex] = React.useState(0)
	const [typed, setTyped] = React.useState('')
	const [isPaused, setIsPaused] = React.useState(false)

	React.useEffect(() => {
		if (phrases.length === 0) return
		let cancelled = false
		let timer: ReturnType<typeof setTimeout> | null = null

		const target = phrases[index] ?? ''

		const typeNext = (cursor: number) => {
			if (cancelled) return
			if (cursor < target.length) {
				setTyped(target.slice(0, cursor + 1))
				timer = setTimeout(() => typeNext(cursor + 1), 55)
			} else {
				setIsPaused(true)
				timer = setTimeout(() => {
					setIsPaused(false)
					backspaceNext(target.length)
				}, 1800)
			}
		}

		const backspaceNext = (cursor: number) => {
			if (cancelled) return
			if (cursor > 0) {
				setTyped(target.slice(0, cursor - 1))
				timer = setTimeout(() => backspaceNext(cursor - 1), 32)
			} else {
				setIndex((prev) => (prev + 1) % phrases.length)
			}
		}

		typeNext(typed.length)

		return () => {
			cancelled = true
			if (timer) clearTimeout(timer)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [index, phrases, typed.length])

	return { typed, currentIndex: index, isPaused }
}
