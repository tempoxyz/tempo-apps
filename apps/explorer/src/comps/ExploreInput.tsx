import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import * as React from 'react'
import { Midcut } from '#comps/Midcut'
import { useMountAnim } from '#lib/animation'
import { ProgressLine } from '#comps/ProgressLine'
import { RelativeTime } from '#comps/RelativeTime'
import { cx } from '#lib/css'
import { isTip20Address } from '#lib/domain/tip20'
import { getApiUrl } from '#lib/env.ts'
import { normalizeSearchInput } from '#lib/tempo-address'
import type {
	AddressSearchResult,
	BlockSearchResult,
	SearchApiResponse,
	SearchResult,
	TokenSearchResult,
} from '#routes/api/search'
import ArrowRight from '~icons/lucide/arrow-right'

const recentSearchesStorageKey = 'tempo-explorer-recent-searches'
const recentSearchesLimit = 6

type ManualActivation =
	| { value: Address.Address; type: 'address' }
	| { value: Hex.Hex; type: 'hash' }
	| { value: string; type: 'block' }

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

function getSearchResultKey(result: SearchResult): string {
	if (result.type === 'block') return `block-${result.blockNumber}`
	if (result.type === 'transaction') return `tx-${result.hash.toLowerCase()}`
	return `${result.type}-${result.address.toLowerCase()}`
}

function isPersistedSearchResult(value: unknown): value is SearchResult {
	if (typeof value !== 'object' || value == null) return false

	const result = value as Record<string, unknown>
	if (
		result.type === 'block' &&
		typeof result.blockNumber === 'number' &&
		Number.isSafeInteger(result.blockNumber) &&
		result.blockNumber >= 0
	)
		return true

	if (
		result.type === 'transaction' &&
		typeof result.hash === 'string' &&
		Hex.validate(result.hash) &&
		Hex.size(result.hash) === 32 &&
		(result.timestamp === undefined || typeof result.timestamp === 'number')
	)
		return true

	const validCategory =
		result.category === undefined ||
		result.category === 'token' ||
		result.category === 'system' ||
		result.category === 'utility' ||
		result.category === 'account' ||
		result.category === 'precompile'
	const validAddressMetadata =
		(result.label === undefined || typeof result.label === 'string') &&
		(result.description === undefined ||
			typeof result.description === 'string') &&
		validCategory

	if (
		result.type === 'address' &&
		typeof result.address === 'string' &&
		Address.validate(result.address) &&
		typeof result.isTip20 === 'boolean' &&
		validAddressMetadata
	)
		return true

	if (
		result.type === 'token' &&
		typeof result.address === 'string' &&
		Address.validate(result.address) &&
		typeof result.name === 'string' &&
		typeof result.symbol === 'string' &&
		typeof result.isTip20 === 'boolean'
	)
		return true

	return false
}

function loadRecentSearches(): SearchResult[] {
	if (typeof window === 'undefined') return []

	try {
		const rawValue = window.localStorage.getItem(recentSearchesStorageKey)
		if (!rawValue) return []
		const parsedValue = JSON.parse(rawValue)
		if (!Array.isArray(parsedValue)) return []
		return parsedValue
			.filter(isPersistedSearchResult)
			.slice(0, recentSearchesLimit)
	} catch {
		return []
	}
}

function persistRecentSearches(results: SearchResult[]): void {
	if (typeof window === 'undefined') return

	try {
		if (results.length === 0) {
			window.localStorage.removeItem(recentSearchesStorageKey)
			return
		}

		window.localStorage.setItem(
			recentSearchesStorageKey,
			JSON.stringify(results.slice(0, recentSearchesLimit)),
		)
	} catch {}
}

function toManualSearchResult(data: ManualActivation): SearchResult {
	if (data.type === 'block')
		return { type: 'block', blockNumber: Number(data.value) }

	if (data.type === 'hash') return { type: 'transaction', hash: data.value }

	return {
		type: 'address',
		address: data.value,
		isTip20: isTip20Address(data.value),
	}
}

export function ExploreInput(props: ExploreInput.Props) {
	const {
		onActivate,
		inputRef: externalInputRef,
		wrapperRef: externalWrapperRef,
		value,
		onChange,
		size = 'medium',
		className,
		wide,
		tabIndex,
		autoFocus,
	} = props
	const formRef = React.useRef<HTMLFormElement>(null)
	const rootRef = React.useRef<HTMLDivElement>(null)
	const resultsRef = React.useRef<HTMLDivElement>(null)

	const internalInputRef = React.useRef<HTMLInputElement>(null)
	const inputRef = externalInputRef ?? internalInputRef

	const [showResults, setShowResults] = React.useState(false)
	const [selectedIndex, setSelectedIndex] = React.useState(-1)
	const [recentSearches, setRecentSearches] = React.useState<SearchResult[]>([])
	const [hasFocus, setHasFocus] = React.useState(false)
	const menuMounted = useMountAnim(showResults, resultsRef)
	const resultsId = React.useId()

	// prevents the menu from reopening when
	// activating a menu item fills the input
	const submittingRef = React.useRef(false)

	const query = value.trim()
	const normalizedQuery = normalizeSearchInput(query)
	const isValidInput =
		query.length > 0 &&
		(Address.validate(normalizedQuery) ||
			(Hex.validate(normalizedQuery) && Hex.size(normalizedQuery) === 32) ||
			parseBlockInput(normalizedQuery) !== null)
	const { data: searchResults, isFetching } = useQuery(
		queryOptions({
			queryKey: ['search', normalizedQuery],
			queryFn: async ({ signal }): Promise<SearchApiResponse> => {
				const url = getApiUrl(
					'/api/search',
					new URLSearchParams({ q: normalizedQuery }),
				)
				const res = await fetch(url, { signal })
				if (!res.ok) throw new Error('Search failed')
				return res.json()
			},
			enabled: normalizedQuery !== '',
			staleTime: 30_000,
			placeholderData: keepPreviousData,
		}),
	)
	const suggestions = searchResults?.results ?? []

	const groupedSuggestions = React.useMemo<
		ExploreInput.SuggestionGroup[]
	>(() => {
		if (query.length === 0 && recentSearches.length > 0)
			return [
				{
					type: 'recent',
					title: 'Recent searches',
					items: recentSearches,
				},
			]

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
			groups.push({
				type: 'address',
				title: 'Contracts & addresses',
				items: addresses,
			})

		if (tokens.length > 0)
			groups.push({ type: 'token', title: 'Tokens', items: tokens })

		return groups
	}, [query.length, recentSearches, suggestions])

	const flatSuggestions = React.useMemo(
		() => groupedSuggestions.flatMap((g) => g.items),
		[groupedSuggestions],
	)

	const closeResults = React.useCallback(() => {
		setHasFocus(false)
		setShowResults(false)
		setSelectedIndex(-1)
	}, [])

	React.useEffect(() => {
		setRecentSearches(loadRecentSearches())
	}, [])

	React.useEffect(() => {
		if (inputRef.current === document.activeElement) setHasFocus(true)
	}, [inputRef])

	React.useEffect(() => {
		if (submittingRef.current) {
			submittingRef.current = false
			return
		}
		setShowResults(hasFocus && (query.length > 0 || recentSearches.length > 0))
	}, [hasFocus, query.length, recentSearches.length])

	const previousResultsKeyRef = React.useRef('')
	React.useEffect(() => {
		const resultsKey = flatSuggestions.map(getSearchResultKey).join('|')
		if (previousResultsKeyRef.current === resultsKey) return
		previousResultsKeyRef.current = resultsKey
		setSelectedIndex(-1)
	}, [flatSuggestions])

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
				closeResults()
			}
		}
		document.addEventListener('mousedown', onMouseDown)
		return () => document.removeEventListener('mousedown', onMouseDown)
	}, [showResults, inputRef, closeResults])

	React.useEffect(() => {
		const root = rootRef.current
		if (!root) return

		const onFocusOut = (event: FocusEvent) => {
			const nextTarget = event.relatedTarget
			if (nextTarget && root.contains(nextTarget as Node)) return
			closeResults()
		}

		root.addEventListener('focusout', onFocusOut)
		return () => root.removeEventListener('focusout', onFocusOut)
	}, [closeResults])

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

	const rememberSearch = React.useCallback((result: SearchResult) => {
		setRecentSearches((current) => {
			const key = getSearchResultKey(result)
			const next = [
				result,
				...current.filter((item) => getSearchResultKey(item) !== key),
			].slice(0, recentSearchesLimit)
			persistRecentSearches(next)
			return next
		})
	}, [])

	const clearRecentSearches = React.useCallback(() => {
		persistRecentSearches([])
		setRecentSearches([])
		setSelectedIndex(-1)
		setShowResults(false)
	}, [])

	const handleActivate = React.useCallback(
		(data: ManualActivation) => {
			rememberSearch(toManualSearchResult(data))
			submittingRef.current = true
			closeResults()
			onActivate?.(data)
		},
		[onActivate, rememberSearch, closeResults],
	)

	const handleSelect = React.useCallback(
		(result: SearchResult) => {
			rememberSearch(result)
			submittingRef.current = true
			closeResults()

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
		[onChange, onActivate, rememberSearch, closeResults],
	)

	return (
		<div
			ref={rootRef}
			className={cx('relative z-10 w-full', !wide && 'max-w-md')}
		>
			<div ref={externalWrapperRef} className="overflow-hidden">
				<form
					ref={formRef}
					autoComplete="off"
					onSubmit={(event) => {
						event.preventDefault()
						if (!formRef.current) return

						const data = new FormData(formRef.current)
						let formValue = data.get('explore-query')
						if (!formValue || typeof formValue !== 'string') return

						formValue = formValue.trim()
						if (!formValue) return

						const normalizedFormValue = normalizeSearchInput(formValue)

						const blockId = parseBlockInput(normalizedFormValue)
						if (blockId !== null) {
							handleActivate({ type: 'block', value: blockId })
							return
						}

						if (Address.validate(normalizedFormValue)) {
							handleActivate({ type: 'address', value: normalizedFormValue })
							return
						}

						if (
							Hex.validate(normalizedFormValue) &&
							Hex.size(normalizedFormValue) === 32
						) {
							handleActivate({ type: 'hash', value: normalizedFormValue })
							return
						}
					}}
					className="relative w-full"
				>
					<input
						ref={inputRef}
						autoFocus={autoFocus}
						autoCapitalize="none"
						autoComplete="off"
						autoCorrect="off"
						tabIndex={tabIndex}
						value={value}
						className={cx(
							'text-search-input bg-surface border-base-border border pl-[16px] pr-[60px] w-full placeholder:text-tertiary rounded-[10px] focus-visible:border-focus outline-0',
							size === 'large' ? 'h-[52px]' : 'h-[42px]',
							className,
						)}
						data-1p-ignore
						name="explore-query"
						placeholder="Search by Address / Tx Hash / Block / Token"
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
							setHasFocus(true)
							onChange?.(event.target.value)
						}}
						onFocus={() => {
							setHasFocus(true)
							if (query.length > 0 || recentSearches.length > 0)
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
						title="Search by Address / Tx Hash / Block / Token (Cmd+K to focus)"
					/>
					<div
						className={cx(
							'absolute top-[50%] -translate-y-[50%]',
							size === 'large' ? 'right-[16px]' : 'right-[12px]',
						)}
					>
						<button
							type="submit"
							aria-label="Search"
							aria-disabled={!isValidInput}
							className={cx(
								'rounded-[10px]! border border-base-border bg-base-background/90 grid place-items-center press-down transition-colors hover:bg-surface',
								size === 'large' ? 'size-[34px]' : 'size-[30px]',
								isValidInput
									? 'text-primary cursor-pointer'
									: 'text-tertiary cursor-default',
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
											{group.title}
										</div>
										{group.type === 'recent' ? (
											<button
												type="button"
												className="text-[12px] text-tertiary hover:text-base-content"
												onMouseDown={(event) => event.preventDefault()}
												onClick={clearRecentSearches}
											>
												Clear
											</button>
										) : (
											<div className="text-[12px] text-tertiary">
												{group.type === 'token'
													? 'Address'
													: group.type === 'transaction'
														? 'Time'
														: ''}
											</div>
										)}
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
		className?: string
		wide?: boolean
		tabIndex?: number
		autoFocus?: boolean
	}

	export type SuggestionGroup = {
		type: 'recent' | 'token' | 'address' | 'transaction' | 'block'
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
				onMouseDown={(event) => {
					event.preventDefault()
					onSelect(suggestion)
				}}
				onClick={(event) => {
					if (event.detail === 0) onSelect(suggestion)
				}}
				className={cx(
					'w-full flex items-center justify-between gap-[10px] overflow-hidden',
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
							<span className="text-[11px] font-medium text-base-content bg-base-alt px-[4px] py-[2px] rounded-[4px] shrink-0">
								{suggestion.symbol}
							</span>
							<span className="text-[11px] font-medium text-tertiary bg-base-alt px-[4px] py-[2px] rounded-[4px] shrink-0">
								TIP-20
							</span>
						</div>
						<span className="text-[13px] font-mono text-accent flex-1 text-right">
							<Midcut value={suggestion.address} prefix="0x" align="end" />
						</span>
					</>
				)}
				{suggestion.type === 'address' && (
					<>
						<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
							<div className="flex min-w-0 max-w-full items-center gap-[8px]">
								{suggestion.label ? (
									<span className="min-w-0 truncate text-[15px] font-medium text-base-content">
										{suggestion.label}
									</span>
								) : (
									<span className="block min-w-0 flex-1 overflow-hidden text-[13px] font-mono text-accent">
										<Midcut value={suggestion.address} prefix="0x" />
									</span>
								)}
								{suggestion.category ? (
									<span className="text-[11px] font-medium text-tertiary bg-base-alt px-[4px] py-[2px] rounded-[4px] shrink-0">
										{suggestion.category}
									</span>
								) : suggestion.isTip20 ? (
									<span className="text-[11px] font-medium text-tertiary bg-base-alt px-[4px] py-[2px] rounded-[4px] shrink-0">
										TIP-20
									</span>
								) : null}
							</div>
							{suggestion.label && (
								<span className="block min-w-0 max-w-full overflow-hidden text-[13px] font-mono text-accent">
									<Midcut value={suggestion.address} prefix="0x" />
								</span>
							)}
						</div>
						{suggestion.description && (
							<span className="hidden w-[44%] shrink-0 text-right text-[13px] leading-[1.25] text-secondary sm:block">
								{suggestion.description}
							</span>
						)}
					</>
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
