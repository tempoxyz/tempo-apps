import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import { Address, Hex } from 'ox'
import * as React from 'react'
import { ProgressLine } from '#components/ui/ProgressLine'
import { RelativeTime } from '#components/ui/RelativeTime'
import { cx } from '#cva.config'
import { HexFormatter } from '#lib/formatting'
import type {
	AddressSearchResult,
	SearchApiResponse,
	SearchResult,
	TokenSearchResult,
} from '#routes/api/search'
import ArrowRight from '~icons/lucide/arrow-right'

export function ExploreInput(props: ExploreInput.Props) {
	const {
		onActivate,
		autoFocus,
		value,
		onChange,
		size = 'medium',
		disabled,
	} = props
	const formRef = React.useRef<HTMLFormElement>(null)
	const resultsRef = React.useRef<HTMLDivElement>(null)

	const inputRef = React.useRef<HTMLInputElement>(null)

	const [showResults, setShowResults] = React.useState(false)
	const [selectedIndex, setSelectedIndex] = React.useState(-1)
	const resultsId = React.useId()

	const query = value.trim()
	const { data: searchResults, isFetching } = useQuery(
		queryOptions({
			queryKey: ['search', query],
			queryFn: async (): Promise<SearchApiResponse> => {
				const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
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

		for (const suggestion of suggestions) {
			// a tx result is always unique so we can return early
			if (suggestion.type === 'transaction')
				return [
					{ type: 'transaction', title: 'Transactions', items: [suggestion] },
				]

			if (suggestion.type === 'token') tokens.push(suggestion)
			else if (suggestion.type === 'address') addresses.push(suggestion)
		}

		const groups: ExploreInput.SuggestionGroup[] = []

		// addresses first
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
	}, [showResults])

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
	}, [])

	// the route transition appears to sometimes steal the focus,
	// so we need to re-focus in case it happens
	React.useEffect(() => {
		const timer = setTimeout(() => {
			if (autoFocus) inputRef.current?.focus()
		}, 100)
		return () => clearTimeout(timer)
	}, [autoFocus])

	const handleSelect = React.useCallback(
		(result: SearchResult) => {
			setShowResults(false)
			setSelectedIndex(-1)

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

				if (Address.validate(formValue)) {
					onActivate?.({ type: 'address', value: formValue })
					return
				}

				if (Hex.validate(formValue) && Hex.size(formValue) === 32) {
					onActivate?.({ type: 'hash', value: formValue })
					return
				}
			}}
			className="relative z-1 w-full max-w-[448px]"
		>
			<input
				ref={inputRef}
				autoCapitalize="none"
				autoComplete="off"
				autoCorrect="off"
				autoFocus={autoFocus}
				value={value}
				disabled={disabled}
				className={cx(
					'bg-surface border-base-border border pl-[16px] pr-[60px] w-full placeholder:text-tertiary text-base-content rounded-[10px] focus-visible:border-focus outline-0 disabled:cursor-not-allowed disabled:opacity-50',
					size === 'large' ? 'h-[52px] text-[17px]' : 'h-[42px] text-[15px]',
				)}
				data-1p-ignore
				name="value"
				placeholder="Enter an address, token or transaction…"
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
				title="Enter an address, token or transaction to explore (Cmd+K to focus)"
			/>
			<div
				className={cx(
					'absolute top-[50%] -translate-y-[50%]',
					size === 'large' ? 'right-[16px]' : 'right-[12px]',
				)}
			>
				<button
					type="submit"
					disabled={disabled}
					className={cx(
						'rounded-full! bg-accent text-base-plane flex items-center justify-center cursor-pointer active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-50',
						size === 'large' ? 'size-[28px]' : 'size-[24px]',
					)}
				>
					<ArrowRight
						className={size === 'large' ? 'size-[16px]' : 'size-[14px]'}
					/>
				</button>
			</div>

			{showResults && (
				<div
					ref={resultsRef}
					id={resultsId}
					role="listbox"
					aria-label="Search suggestions"
					className={cx(
						'absolute left-0 right-0 mt-[8px]',
						'bg-surface border border-base-border rounded-[10px] overflow-hidden',
						'shadow-[0px_4px_44px_rgba(0,0,0,0.05)]',
					)}
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
		</form>
	)
}

export namespace ExploreInput {
	export type ValueType = 'address' | 'hash'

	export interface Props {
		onActivate?: (
			data:
				| { value: Address.Address; type: 'address' }
				| { value: Address.Address; type: 'token' }
				| { value: Hex.Hex; type: 'hash' },
		) => void
		autoFocus?: boolean
		value: string
		onChange: (value: string) => void
		size?: 'large' | 'medium'
		disabled?: boolean
	}

	export type SuggestionGroup = {
		type: 'token' | 'address' | 'transaction'
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
				{suggestion.type === 'token' && (
					<>
						<div className="flex items-center gap-[10px] min-w-0 flex-1">
							<span className="text-[16px] font-medium text-base-content truncate">
								{suggestion.name}
							</span>
							<span className="text-[11px] font-medium text-base-content bg-border-primary p-[4px] rounded-[4px] shrink-0">
								{suggestion.symbol}
							</span>
						</div>
						<span className="text-[13px] font-mono text-accent">
							{HexFormatter.shortenHex(suggestion.address, 6)}
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
							{HexFormatter.shortenHex(suggestion.hash, 8)}
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
