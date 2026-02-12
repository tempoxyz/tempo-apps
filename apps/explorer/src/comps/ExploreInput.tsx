import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import * as React from 'react'
import { Midcut } from '#comps/Midcut'
import { useMountAnim } from '#lib/animation'
import { ProgressLine } from '#comps/ProgressLine'
import { RelativeTime } from '#comps/RelativeTime'
import { cx } from '#lib/css'
import { getApiUrl } from '#lib/env.ts'
import type {
	AddressSearchResult,
	BlockSearchResult,
	SearchApiResponse,
	SearchResult,
	TokenSearchResult,
} from '#routes/api/search'
import ArrowRight from '~icons/lucide/arrow-right'

function parseBlockInput(raw: string): string | null {
	const trimmed = raw.trim()
	const withoutHash = trimmed.startsWith('#')
		? trimmed.slice(1).trim()
		: trimmed
	if (!/^\d+$/.test(withoutHash)) return null
	const n = Number(withoutHash)
	if (!Number.isFinite(n) || !Number.isSafeInteger(n) || n < 0) return null
	return String(n)
}

export function ExploreInput(props: ExploreInput.Props) {
	const {
		onActivate,
		inputRef: externalInputRef,
		wrapperRef: externalWrapperRef,
		value,
		onChange,
		size = 'medium',
		disabled,
		className,
		wide,
		tabIndex,
	} = props
	const formRef = React.useRef<HTMLFormElement>(null)
	const resultsRef = React.useRef<HTMLDivElement>(null)

	const internalInputRef = React.useRef<HTMLInputElement>(null)
	const inputRef = externalInputRef ?? internalInputRef

	const [showResults, setShowResults] = React.useState(false)
	const [selectedIndex, setSelectedIndex] = React.useState(-1)
	const menuMounted = useMountAnim(showResults, resultsRef)
	const resultsId = React.useId()

	// prevents the menu from reopening when
	// activating a menu item fills the input
	const submittingRef = React.useRef(false)

	const query = value.trim()
	const isValidInput =
		query.length > 0 &&
		(Address.validate(query) ||
			(Hex.validate(query) && Hex.size(query) === 32) ||
			parseBlockInput(query) !== null)
	const { data: searchResults, isFetching } = useQuery(
		queryOptions({
			queryKey: ['search', query],
			queryFn: async ({ signal }): Promise<SearchApiResponse> => {
				const url = getApiUrl('/api/search', new URLSearchParams({ q: query }))
				const res = await fetch(url, { signal })
				if (!res.ok) throw new Error('Search failed')
				return res.json()
			},
			enabled: query !== '',
			staleTime: 30_000,
			placeholderData: keepPreviousData,
		}),
	)
	const suggestions = searchResults?.results ?? []

	const groupedSuggestions = React.useMemo<
		ExploreInput.SuggestionGroup[]
	>(() => {
		const tokens: TokenSearchResult[] = []
		const addresses: AddressSearchResult[] = []
		const blocks: BlockSearchResult[] = []

		for (const suggestion of suggestions) {
			if (suggestion.type === 'transaction')
				return [
					{ type: 'transaction', title: 'Transactions', items: [suggestion] },
				]

			if (suggestion.type === 'token') tokens.push(suggestion)
			else if (suggestion.type === 'address') addresses.push(suggestion)
			else if (suggestion.type === 'block') blocks.push(suggestion)
		}

		const groups: ExploreInput.SuggestionGroup[] = []

		if (blocks.length > 0)
			groups.push({ type: 'block', title: 'Blocks', items: blocks })

		if (addresses.length > 0)
			groups.push({ type: 'address', title: 'Addresses', items: addresses })

		if (tokens.length > 0)
			groups.push({ type: 'token', title: 'Tokens', items: tokens })

		return groups
	}, [suggestions])

	const flatSuggestions = React.useMemo(
		() => groupedSuggestions.flatMap((g) => g.items),
		[groupedSuggestions],
	)

	React.useEffect(() => {
		if (submittingRef.current) {
			submittingRef.current = false
			return
		}
		setShowResults(disabled ? false : query.length > 0)
	}, [query, disabled])

	const lastResultsKey = React.useRef('')
	const resultsKey = JSON.stringify(flatSuggestions)
	if (lastResultsKey.current !== resultsKey) {
		lastResultsKey.current = resultsKey
		setSelectedIndex(-1)
	}

	// click outside (TODO: move focus from input to results menu)
	React.useEffect(() => {
		if (!showResults) return
		const onMouseDown = (event: MouseEvent) => {
			if (
				resultsRef.current &&
				!resultsRef.current.contains(event.target as Node) &&
				inputRef.current &&
				!inputRef.current.contains(event.target as Node)
			) {
				setShowResults(false)
				setSelectedIndex(-1)
			}
		}
		document.addEventListener('mousedown', onMouseDown)
		return () => document.removeEventListener('mousedown', onMouseDown)
	}, [showResults, inputRef])

	// cmd+k shortcut
	React.useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
				event.preventDefault()
				inputRef.current?.focus()
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [inputRef])

	const handleSelect = React.useCallback(
		(result: SearchResult) => {
			submittingRef.current = true
			setShowResults(false)
			setSelectedIndex(-1)

			if (result.type === 'block') {
				const id = String(result.blockNumber)
				onChange?.(id)
				onActivate?.({ type: 'block', value: id })
				return
			}

			if (result.type === 'token') {
				onChange?.(result.address)
				onActivate?.({ type: 'token', value: result.address })
				return
			}

			if (result.type === 'address') {
				onChange?.(result.address)
				onActivate?.({ type: 'address', value: result.address })
				return
			}

			if (result.type === 'transaction') {
				onChange?.(result.hash)
				onActivate?.({ type: 'hash', value: result.hash })
				return
			}
		},
		[onChange, onActivate],
	)

	return (
		<div className={cx('relative z-10 w-full', !wide && 'max-w-md')}>
			<div
				ref={externalWrapperRef}
				className="overflow-hidden"
				style={
					externalWrapperRef ? { opacity: 0, pointerEvents: 'none' } : undefined
				}
			>
				<form
					ref={formRef}
					onSubmit={(event) => {
						event.preventDefault()
						if (!formRef.current || disabled) return

						const data = new FormData(formRef.current)
						let formValue = data.get('value')
						if (!formValue || typeof formValue !== 'string') return

						formValue = formValue.trim()
						if (!formValue) return

						const blockId = parseBlockInput(formValue)
						if (blockId !== null) {
							onActivate?.({ type: 'block', value: blockId })
							return
						}

						if (Address.validate(formValue)) {
							onActivate?.({ type: 'address', value: formValue })
							return
						}

						if (Hex.validate(formValue) && Hex.size(formValue) === 32) {
							onActivate?.({ type: 'hash', value: formValue })
							return
						}
					}}
					className="relative w-full"
				>
					<input
						ref={inputRef}
						autoCapitalize="none"
						autoComplete="off"
						autoCorrect="off"
						tabIndex={tabIndex}
						value={value}
						disabled={disabled}
						className={cx(
							'bg-surface border-base-border border pl-[16px] pr-[60px] w-full placeholder:text-tertiary text-base-content rounded-[10px] focus-visible:border-focus outline-0 disabled:cursor-not-allowed disabled:opacity-50',
							size === 'large'
								? 'h-[52px] text-[17px]'
								: 'h-[42px] text-[15px]',
							className,
						)}
						data-1p-ignore
						name="value"
						placeholder="Enter an address, block, token or transaction…"
						spellCheck={false}
						type="text"
						onKeyDown={(event) => {
							if (event.key === 'Escape' && showResults) {
								event.preventDefault()
								setShowResults(false)
								setSelectedIndex(-1)
								return
							}

							if (!showResults || flatSuggestions.length === 0) return

							if (event.key === 'ArrowDown') {
								event.preventDefault()
								setSelectedIndex((prev) =>
									prev < flatSuggestions.length - 1 ? prev + 1 : 0,
								)
								return
							}

							if (event.key === 'ArrowUp') {
								event.preventDefault()
								setSelectedIndex((prev) =>
									prev > 0 ? prev - 1 : flatSuggestions.length - 1,
								)
								return
							}

							if (event.key === 'Enter') {
								const index = selectedIndex >= 0 ? selectedIndex : 0
								if (index < flatSuggestions.length) {
									event.preventDefault()
									handleSelect(flatSuggestions[index])
								}
								return
							}
						}}
						onChange={(event) => {
							onChange?.(event.target.value)
						}}
						onFocus={() => {
							if (query.length > 0 && flatSuggestions.length > 0)
								setShowResults(true)
						}}
						role="combobox"
						aria-expanded={showResults}
						aria-haspopup="listbox"
						aria-autocomplete="list"
						aria-controls={resultsId}
						aria-activedescendant={
							selectedIndex !== -1 ? `${resultsId}-${selectedIndex}` : undefined
						}
						title="Enter an address, block, token or transaction to explore (Cmd+K to focus)"
					/>
					<div
						className={cx(
							'absolute top-[50%] -translate-y-[50%]',
							size === 'large' ? 'right-[16px]' : 'right-[12px]',
						)}
					>
						<button
							type="submit"
							disabled={disabled || !isValidInput}
							aria-label="Search"
							className={cx(
								'rounded-full! flex items-center justify-center active:translate-y-[0.5px] disabled:cursor-not-allowed transition-colors',
								size === 'large' ? 'size-[28px]' : 'size-[24px]',
								isValidInput
									? 'bg-accent text-base-plane cursor-pointer'
									: 'bg-base-alt text-tertiary cursor-default',
							)}
						>
							<ArrowRight
								className={size === 'large' ? 'size-[16px]' : 'size-[14px]'}
							/>
						</button>
					</div>
				</form>
			</div>

			{menuMounted && (
				<div
					ref={resultsRef}
					id={resultsId}
					role="listbox"
					aria-label="Search suggestions"
					className={cx(
						'absolute left-0 right-0 mt-2 z-50',
						'bg-surface border border-base-border rounded-[10px] overflow-hidden',
						'shadow-[0px_4px_44px_rgba(0,0,0,0.05)]',
					)}
					style={{ opacity: 0 }}
				>
					<ProgressLine
						loading={isFetching}
						start={150}
						className="absolute top-0 left-0 right-0"
					/>
					{flatSuggestions.length === 0 ? (
						<div className="px-[16px] py-[12px] text-[14px] text-tertiary">
							{!searchResults ? 'Searching…' : 'No results'}
						</div>
					) : (
						<div className="flex flex-col py-[4px]">
							{groupedSuggestions.map((group, groupIndex) => (
								<div key={group.type} className="flex flex-col">
									<div
										className={cx(
											'flex justify-between items-center px-[12px] py-[6px]',
											groupIndex > 0 && 'pt-[12px]',
										)}
									>
										<div className="text-[12px] text-secondary">
											{group.type === 'token'
												? 'Tokens'
												: group.type === 'transaction'
													? 'Receipt'
													: group.type === 'block'
														? 'Block'
														: 'Address'}
										</div>
										<div className="text-[12px] text-tertiary">
											{group.type === 'token'
												? 'Address'
												: group.type === 'transaction'
													? 'Time'
													: ''}
										</div>
									</div>
									{group.items.map((item) => {
										const flatIndex = flatSuggestions.indexOf(item)
										const key =
											item.type === 'transaction'
												? `tx-${item.hash}`
												: item.type === 'block'
													? `block-${item.blockNumber}`
													: `${item.type}-${item.address}`
										return (
											<ExploreInput.SuggestionItem
												key={key}
												suggestion={item}
												isSelected={flatIndex === selectedIndex}
												onSelect={handleSelect}
												id={`${resultsId}-${flatIndex}`}
											/>
										)
									})}
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	)
}

export namespace ExploreInput {
	export type ValueType = 'address' | 'hash' | 'block'

	export interface Props {
		onActivate?: (
			data:
				| { value: Address.Address; type: 'address' }
				| { value: Address.Address; type: 'token' }
				| { value: Hex.Hex; type: 'hash' }
				| { value: string; type: 'block' },
		) => void
		inputRef?: React.RefObject<HTMLInputElement | null>
		wrapperRef?: React.RefObject<HTMLDivElement | null>
		value: string
		onChange: (value: string) => void
		size?: 'large' | 'medium'
		disabled?: boolean
		className?: string
		wide?: boolean
		tabIndex?: number
	}

	export type SuggestionGroup = {
		type: 'token' | 'address' | 'transaction' | 'block'
		title: string
		items: SearchResult[]
	}

	export function SuggestionItem(props: SuggestionItem.Props) {
		const { suggestion, isSelected, onSelect, id } = props
		const itemRef = React.useRef<HTMLButtonElement>(null)

		React.useEffect(() => {
			if (isSelected) itemRef.current?.scrollIntoView({ block: 'nearest' })
		}, [isSelected])

		return (
			<button
				ref={itemRef}
				id={id}
				type="button"
				role="option"
				aria-selected={isSelected}
				onClick={() => onSelect(suggestion)}
				className={cx(
					'w-full flex items-center justify-between gap-[10px]',
					'text-left cursor-pointer px-[12px] py-[6px] press-down hover:bg-base-alt/25',
					isSelected && 'bg-base-alt/25',
				)}
			>
				{suggestion.type === 'block' && (
					<span className="text-[16px] font-medium text-base-content tabular-nums">
						#{suggestion.blockNumber}
					</span>
				)}
				{suggestion.type === 'token' && (
					<>
						<div className="flex items-center gap-[10px] min-w-0 shrink">
							<span className="text-[16px] font-medium text-base-content truncate">
								{suggestion.name}
							</span>
							<span className="text-[11px] font-medium text-base-content bg-border-primary p-[4px] rounded-[4px] shrink-0">
								{suggestion.symbol}
							</span>
						</div>
						<span className="text-[13px] font-mono text-accent flex-1 text-right">
							<Midcut value={suggestion.address} prefix="0x" align="end" />
						</span>
					</>
				)}
				{suggestion.type === 'address' && (
					<span className="text-[13px] font-mono text-accent truncate">
						{suggestion.address}
					</span>
				)}
				{suggestion.type === 'transaction' && (
					<>
						<span className="text-[13px] font-mono text-accent truncate min-w-0 flex-1">
							<Midcut value={suggestion.hash} prefix="0x" />
						</span>
						{suggestion.timestamp ? (
							<RelativeTime
								timestamp={BigInt(suggestion.timestamp)}
								className="text-[12px] text-tertiary"
							/>
						) : (
							<span className="text-[12px] text-tertiary">−</span>
						)}
					</>
				)}
			</button>
		)
	}

	export namespace SuggestionItem {
		export interface Props {
			suggestion: SearchResult
			isSelected: boolean
			onSelect: (suggestion: SearchResult) => void
			id: string
		}
	}
}
