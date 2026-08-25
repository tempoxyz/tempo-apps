/**
 * The simulator's input pane.
 *
 * Structure, top to bottom: context (network + block), then the call itself
 * (from → to → calldata), then everything else behind additive rows. The rows
 * matter — a gas limit of 500,000,000 sitting permanently on screen is a
 * nine-digit number the user never chose, and it was the most confusing thing
 * on the empty page. Nothing is visible unless it was asked for.
 */

import * as OxAddress from 'ox/Address'
import * as OxHex from 'ox/Hex'
import * as React from 'react'
import type { Abi, AbiFunction } from 'viem'
import {
	decodeFunctionData,
	encodeFunctionData,
	getFunctionSelector,
} from 'viem'
import { cx } from '#lib/css'
import {
	getContractInfo,
	getInputType,
	getPlaceholder,
	parseInputValue,
	precompileRegistry,
} from '#lib/domain/contracts'
import {
	type CallDraft,
	draftFieldErrors,
	emptyCall,
	type FormState,
	MAX_URL_CALLDATA_BYTES,
} from '#lib/domain/simulate-calls'
import { HexFormatter } from '#lib/formatting'
import { useCopy } from '#lib/hooks'
import { useAutoloadAbi } from '#lib/queries'
import {
	Button,
	Chip,
	Field,
	inputClass,
	inputValueToString,
	SegmentedControl,
} from './SimulateShared'
import CheckIcon from '~icons/lucide/check'
import ChevronDownIcon from '~icons/lucide/chevron-down'
import CopyIcon from '~icons/lucide/copy'
import DownloadIcon from '~icons/lucide/download'
import LayersIcon from '~icons/lucide/layers'
import PlusIcon from '~icons/lucide/plus'
import Trash2Icon from '~icons/lucide/trash-2'
import XIcon from '~icons/lucide/x'
import ZapIcon from '~icons/lucide/zap'

export function SimulateCallForm(
	props: SimulateCallForm.Props,
): React.JSX.Element {
	const { form, setForm } = props
	const [touched, setTouched] = React.useState<Set<string>>(new Set())
	const errors = draftFieldErrors(form)
	const touch = React.useCallback(
		(key: string) => setTouched((current) => new Set(current).add(key)),
		[],
	)
	const shows = (key: string, invalid: boolean) => invalid && touched.has(key)

	const updateCall = React.useCallback(
		(index: number, patch: Partial<CallDraft>) =>
			setForm((current) => ({
				...current,
				calls: current.calls.map((call, i) =>
					i === index ? { ...call, ...patch } : call,
				),
			})),
		[setForm],
	)

	const step = Math.min(props.step, form.calls.length - 1)
	const active = form.calls[step] ?? emptyCall
	const isBatch = form.calls.length > 1

	return (
		<div className="flex min-w-0 flex-col">
			<ContextBar
				form={form}
				setForm={setForm}
				blockInvalid={shows('block', errors.block)}
				onBlockBlur={() => touch('block')}
			/>

			<div className="flex min-w-0 flex-1 flex-col gap-[14px] overflow-y-auto px-[16px] py-[14px]">
				<LoadTransaction
					value={props.loadHash}
					onChange={props.setLoadHash}
					onLoad={props.onLoad}
					loading={props.loadingTransaction}
					error={props.loadError}
				/>

				<Field label="From" invalid={shows('from', errors.from)}>
					<AddressInput
						value={form.from}
						onChange={(value) =>
							setForm((current) => ({ ...current, from: value }))
						}
						onBlur={() => touch('from')}
						invalid={shows('from', errors.from)}
						placeholder="0x sender — defaults to the zero address"
					/>
				</Field>

				{isBatch && (
					<StepTabs
						calls={form.calls}
						step={step}
						onSelect={props.onStepChange}
						onAdd={() => {
							setForm((current) => ({
								...current,
								calls: [...current.calls, emptyCall],
							}))
							props.onStepChange(form.calls.length)
						}}
						onRemove={(index) => {
							setForm((current) => ({
								...current,
								calls: current.calls.filter((_, i) => i !== index),
							}))
							props.onStepChange(Math.max(0, index - 1))
						}}
					/>
				)}

				<CallFields
					call={active}
					index={step}
					errors={
						errors.calls[step] ?? { to: false, data: false, value: false }
					}
					touched={touched}
					onTouch={touch}
					onChange={(patch) => updateCall(step, patch)}
				/>

				<OptionalRow
					icon={<ZapIcon className="size-[13px]" />}
					label="Gas limit"
					summary={
						form.gas !== props.defaultGas
							? Number(form.gas).toLocaleString()
							: undefined
					}
					onReset={() =>
						setForm((current) => ({ ...current, gas: props.defaultGas }))
					}
				>
					<Field
						label="Gas limit"
						invalid={shows('gas', errors.gas)}
						hint={
							shows('gas', errors.gas)
								? 'Whole numbers only.'
								: `Block limit is ${Number(props.defaultGas).toLocaleString()}.`
						}
					>
						<input
							value={form.gas}
							onChange={(event) =>
								setForm((current) => ({ ...current, gas: event.target.value }))
							}
							onBlur={() => touch('gas')}
							className={inputClass(shows('gas', errors.gas))}
						/>
					</Field>
				</OptionalRow>

				{/* Adding a call comes after the optional rows, so the run of `+` rows
				    stays unbroken and the batch action reads as its own step. */}
				{!isBatch && (
					<Button
						onClick={() => {
							setForm((current) => ({
								...current,
								calls: [...current.calls, emptyCall],
							}))
							props.onStepChange(1)
						}}
						className="mt-[2px] w-fit border-dashed"
						title="Run several calls in order against each other's state, the way a Tempo batch transaction executes"
					>
						<PlusIcon className="size-[12px]" />
						Add a call
					</Button>
				)}

				{isBatch && (
					<p className="type-card text-content-dimmed">
						Calls run in order against each other{'’'}s state, the way a Tempo
						batch transaction executes.
					</p>
				)}

				{props.formError && (
					<p className="type-card text-negative">{props.formError}</p>
				)}
			</div>
		</div>
	)
}

export declare namespace SimulateCallForm {
	interface Props {
		form: FormState
		setForm: React.Dispatch<React.SetStateAction<FormState>>
		/** Index of the batch call being edited, mirrored in the URL. */
		step: number
		onStepChange: (index: number) => void
		defaultGas: string
		formError: string | null
		loadHash: string
		setLoadHash: (value: string) => void
		loadError: string | null
		loadingTransaction: boolean
		onLoad: () => void
	}
}

/**
 * Network and block sit above the call, not below it: they are the state the
 * call runs against, and reading them after the call is reading the sentence
 * backwards. `Block` was previously a free-text field asking for "latest or
 * block hash", which nobody types.
 */
function ContextBar(props: {
	form: FormState
	setForm: React.Dispatch<React.SetStateAction<FormState>>
	blockInvalid: boolean
	onBlockBlur: () => void
}): React.JSX.Element {
	const { form, setForm } = props
	const pinned = form.block !== 'latest'
	return (
		<div className="flex flex-col gap-[8px] border-b border-card-border px-[16px] py-[10px]">
			<div className="flex items-center justify-between gap-[8px]">
				<span className="type-card text-tertiary">Simulate against</span>
				<SegmentedControl
					size="sm"
					value={pinned ? 'pinned' : 'latest'}
					options={[
						{
							value: 'latest',
							label: 'Latest',
							title: 'The current chain tip',
						},
						{
							value: 'pinned',
							label: 'Pinned block',
							title: 'A specific block hash',
						},
					]}
					onChange={(value) =>
						setForm((current) => ({
							...current,
							block: value === 'latest' ? 'latest' : '',
						}))
					}
				/>
			</div>
			{pinned && (
				<input
					value={form.block}
					onChange={(event) =>
						setForm((current) => ({ ...current, block: event.target.value }))
					}
					onBlur={props.onBlockBlur}
					placeholder="0x block hash"
					className={inputClass(props.blockInvalid)}
				/>
			)}
		</div>
	)
}

/**
 * A different mode from composing a call, so it is visually a different thing —
 * not a fourth field in the same stack.
 */
function LoadTransaction(props: {
	value: string
	onChange: (value: string) => void
	onLoad: () => void
	loading: boolean
	error: string | null
}): React.JSX.Element {
	const id = React.useId()
	return (
		<div className="flex flex-col gap-[5px] rounded-[8px] border border-dashed border-card-border px-[10px] py-[9px]">
			<label className="type-card text-tertiary" htmlFor={id}>
				Replay an existing transaction
			</label>
			<div className="flex gap-[6px]">
				<input
					id={id}
					value={props.value}
					onChange={(event) => props.onChange(event.target.value)}
					onKeyDown={(event) => event.key === 'Enter' && props.onLoad()}
					placeholder="0x transaction hash"
					className={inputClass(false)}
				/>
				<Button onClick={props.onLoad} disabled={props.loading}>
					<DownloadIcon className="size-[12px]" />
					{props.loading ? 'Loading…' : 'Load'}
				</Button>
			</div>
			{props.error && (
				<span className="type-card text-negative">{props.error}</span>
			)}
		</div>
	)
}

/**
 * Which call of a batch is being edited. Status lives on the result pane's step
 * bar, not here — this control is for composing, and duplicating the outcome in
 * two places invites them to disagree.
 */
function StepTabs(props: {
	calls: readonly CallDraft[]
	step: number
	onSelect: (index: number) => void
	onAdd: () => void
	onRemove: (index: number) => void
}): React.JSX.Element {
	return (
		<div className="flex flex-col gap-[6px]">
			<span className="type-card text-tertiary">
				Calls
				<span className="ml-[6px] text-content-dimmed">
					{props.calls.length} in order
				</span>
			</span>
			<div className="flex flex-wrap items-center gap-[6px]">
				{props.calls.map((call, index) => {
					const selected = index === props.step
					return (
						<div key={index} className="group relative">
							<button
								type="button"
								onClick={() => props.onSelect(index)}
								title={call.to || `Call ${index + 1}`}
								className={cx(
									'flex h-[28px] items-center gap-[6px] rounded-[6px] border px-[8px] type-card cursor-pointer press-down transition-colors',
									selected
										? 'border-accent bg-accent/8 text-primary'
										: 'border-card-border text-tertiary hover:text-secondary',
								)}
							>
								<span className="flex size-[15px] shrink-0 items-center justify-center rounded-full bg-distinct text-[10px] text-tertiary">
									{index + 1}
								</span>
								<span className="font-mono">
									{call.to
										? HexFormatter.truncate(call.to as OxHex.Hex)
										: 'empty'}
								</span>
							</button>
							{props.calls.length > 1 && (
								<button
									type="button"
									onClick={() => props.onRemove(index)}
									title="Remove this call"
									className="absolute -top-[5px] -right-[5px] hidden size-[15px] items-center justify-center rounded-full border border-card-border bg-base-plane text-tertiary cursor-pointer group-hover:flex hover:text-negative"
								>
									<XIcon className="size-[9px]" />
								</button>
							)}
						</div>
					)
				})}
				<button
					type="button"
					onClick={props.onAdd}
					title="Add a call"
					className="flex size-[26px] items-center justify-center rounded-[6px] border border-dashed border-card-border text-tertiary cursor-pointer press-down hover:border-accent hover:text-primary"
				>
					<PlusIcon className="size-[12px]" />
				</button>
			</div>
		</div>
	)
}

function CallFields(props: {
	call: CallDraft
	index: number
	errors: { to: boolean; data: boolean; value: boolean }
	touched: Set<string>
	onTouch: (key: string) => void
	onChange: (patch: Partial<CallDraft>) => void
}): React.JSX.Element {
	const { call, index } = props
	const address = OxAddress.validate(call.to)
		? (call.to as OxAddress.Address)
		: undefined
	const { data: abi } = useAutoloadAbi({ address, enabled: Boolean(address) })
	const toKey = `to-${index}`
	const valueKey = `value-${index}`
	const shows = (key: string, invalid: boolean) =>
		invalid && props.touched.has(key)

	// Same resolution order the trace tree uses, so the form and the trace name
	// the same contract the same way.
	const resolvedName = React.useMemo(() => {
		if (!address) return undefined
		const precompile = precompileRegistry.get(
			address.toLowerCase() as `0x${string}`,
		)
		if (precompile) return precompile.name
		return getContractInfo(address)?.name
	}, [address])

	return (
		<div className="flex flex-col gap-[12px]">
			{/* The resolved name goes on the label line, not inside the field: an
			    absolutely-positioned chip has no idea how wide the name is, and
			    "TIP-20 Channel Reserve" sat straight on top of the address. This is
			    also where the calldata field puts its mode toggle. */}
			<Field
				label="To"
				invalid={shows(toKey, props.errors.to)}
				action={
					resolvedName ? (
						<Chip tone="accent" title={call.to}>
							{resolvedName}
						</Chip>
					) : undefined
				}
			>
				<AddressInput
					value={call.to}
					onChange={(value) => props.onChange({ to: value })}
					onBlur={() => props.onTouch(toKey)}
					invalid={shows(toKey, props.errors.to)}
					placeholder="0x contract address"
				/>
			</Field>

			<CalldataField
				abi={abi as Abi | undefined}
				// "no ABI" is only a fact once there is an address to have failed to
				// resolve. On an empty form it is just a scold.
				hasTarget={Boolean(address)}
				data={call.data}
				invalid={shows(`data-${index}`, props.errors.data)}
				onBlur={() => props.onTouch(`data-${index}`)}
				onChange={(data) => props.onChange({ data })}
			/>

			<OptionalRow
				icon={<LayersIcon className="size-[13px]" />}
				label="Value"
				summary={call.value !== '0' ? call.value : undefined}
				onReset={() => props.onChange({ value: '0' })}
			>
				<Field
					label="Value"
					invalid={shows(valueKey, props.errors.value)}
					hint={
						shows(valueKey, props.errors.value)
							? 'Whole numbers only.'
							: undefined
					}
				>
					<input
						value={call.value}
						onChange={(event) => props.onChange({ value: event.target.value })}
						onBlur={() => props.onTouch(valueKey)}
						className={inputClass(shows(valueKey, props.errors.value))}
					/>
				</Field>
			</OptionalRow>
		</div>
	)
}

function AddressInput(props: {
	value: string
	onChange: (value: string) => void
	onBlur: () => void
	invalid: boolean
	placeholder: string
}): React.JSX.Element {
	return (
		<input
			value={props.value}
			onChange={(event) => props.onChange(event.target.value)}
			onBlur={props.onBlur}
			placeholder={props.placeholder}
			spellCheck={false}
			className={inputClass(props.invalid)}
		/>
	)
}

/**
 * One value, two representations, one explicit toggle on the label line.
 *
 * The previous split between a function picker and a separate calldata box let
 * the two disagree silently — the form could show one call while running
 * another. The function selector belongs *inside* this control, because picking
 * a function is choosing how to write the same bytes.
 */
export function CalldataField(props: {
	abi: Abi | undefined
	hasTarget: boolean
	data: string
	invalid: boolean
	onBlur: () => void
	onChange: (data: string) => void
}): React.JSX.Element {
	const { abi, data, onChange } = props
	// Every function, not just the writes: "what does this return" is a
	// first-class reason to simulate, and read calls are the cheapest way in.
	const functions = React.useMemo(
		() =>
			(abi ?? []).filter(
				(item): item is AbiFunction => item.type === 'function',
			),
		[abi],
	)
	const [mode, setMode] = React.useState<'decoded' | 'hex'>('decoded')
	const [selector, setSelector] = React.useState('')
	const [values, setValues] = React.useState<string[]>([])
	const [mismatch, setMismatch] = React.useState(false)
	const copy = useCopy({ timeout: 1_500 })

	const selected = functions.find((fn) => getFunctionSelector(fn) === selector)

	// Keep the decoded view in step with hex edits, and say so when it can't.
	React.useEffect(() => {
		if (!abi || !OxHex.validate(data) || data.length < 10) {
			setMismatch(false)
			return
		}
		try {
			const decoded = decodeFunctionData({ abi, data: data as OxHex.Hex })
			setSelector(OxHex.slice(data as OxHex.Hex, 0, 4))
			setValues((decoded.args ?? []).map((value) => inputValueToString(value)))
			setMismatch(false)
		} catch {
			setMismatch(true)
		}
	}, [abi, data])

	const encode = React.useCallback(
		(fn: AbiFunction, nextValues: string[]) => {
			try {
				const args = fn.inputs.map((input, index) =>
					parseInputValue(nextValues[index] ?? '', input.type),
				)
				onChange(encodeFunctionData({ abi: [fn], functionName: fn.name, args }))
				setMismatch(false)
			} catch {
				// Incomplete input while typing — leave the hex at its last good value.
			}
		},
		[onChange],
	)

	const canDecode = functions.length > 0
	const showDecoded = canDecode && mode === 'decoded' && !mismatch
	const byteLength = OxHex.validate(data) ? OxHex.size(data) : 0

	return (
		<Field
			label="Calldata"
			action={
				canDecode ? (
					<SegmentedControl
						size="sm"
						value={mode}
						options={[
							{ value: 'decoded', label: 'Decoded' },
							{ value: 'hex', label: 'Hex' },
						]}
						onChange={setMode}
					/>
				) : props.hasTarget && !abi ? (
					// No ABI is a fact, not an error — say it once and stay usable.
					<span className="type-card text-content-dimmed">
						no ABI · hex only
					</span>
				) : undefined
			}
		>
			{mismatch && mode === 'decoded' && (
				<div className="rounded-[6px] border border-warning/40 bg-warning-background px-[9px] py-[6px] type-card text-secondary">
					This calldata doesn{'’'}t match any function in the contract{'’'}s ABI
					— showing hex.
				</div>
			)}

			{showDecoded ? (
				<div className="flex flex-col gap-[9px] rounded-[6px] border border-card-border bg-base-plane p-[9px]">
					<select
						value={selector}
						onChange={(event) => {
							const next = event.target.value
							setSelector(next)
							const fn = functions.find(
								(candidate) => getFunctionSelector(candidate) === next,
							)
							if (!fn) return
							const blank = fn.inputs.map(() => '')
							setValues(blank)
							if (fn.inputs.length === 0) encode(fn, blank)
						}}
						className={cx(inputClass(false), 'bg-card-header')}
					>
						<option value="">Select a function…</option>
						{functions.map((fn) => (
							<option
								key={getFunctionSelector(fn)}
								value={getFunctionSelector(fn)}
							>
								{fn.name || getFunctionSelector(fn)}(
								{fn.inputs.map((input) => input.type).join(', ')})
							</option>
						))}
					</select>

					{selected?.inputs.map((input, index) => (
						<div
							key={`${input.name}-${input.type}-${index}`}
							className="flex flex-col gap-[4px]"
						>
							<span className="type-card text-tertiary">
								{input.name || `arg ${index}`}
								<span className="ml-[6px] font-mono text-content-dimmed">
									{input.type}
								</span>
							</span>
							{getInputType(input.type) === 'textarea' ? (
								<textarea
									value={values[index] ?? ''}
									onChange={(event) => {
										const next = values.map((value, itemIndex) =>
											itemIndex === index ? event.target.value : value,
										)
										setValues(next)
										encode(selected, next)
									}}
									placeholder={getPlaceholder(input)}
									className={cx(
										inputClass(false),
										'min-h-[56px] resize-y bg-card-header',
									)}
								/>
							) : (
								<input
									type={getInputType(input.type)}
									checked={
										getInputType(input.type) === 'checkbox'
											? values[index] === 'true'
											: undefined
									}
									value={values[index] ?? ''}
									onChange={(event) => {
										const value =
											event.target.type === 'checkbox'
												? String(event.target.checked)
												: event.target.value
										const next = values.map((current, itemIndex) =>
											itemIndex === index ? value : current,
										)
										setValues(next)
										encode(selected, next)
									}}
									placeholder={getPlaceholder(input)}
									className={cx(inputClass(false), 'bg-card-header')}
								/>
							)}
						</div>
					))}

					{data && data !== '0x' && (
						<div className="flex items-center gap-[8px] border-t border-dashed border-card-border pt-[8px] type-card">
							<span className="min-w-0 flex-1 truncate type-card-data text-tertiary">
								{data}
							</span>
							<span className="shrink-0 text-content-dimmed">
								{byteLength} bytes
							</span>
							<button
								type="button"
								onClick={() => copy.copy(data)}
								className="shrink-0 text-tertiary cursor-pointer press-down hover:text-primary"
								title="Copy calldata"
							>
								{copy.notifying ? (
									<CheckIcon className="size-[12px]" />
								) : (
									<CopyIcon className="size-[12px]" />
								)}
							</button>
						</div>
					)}
				</div>
			) : (
				<>
					<textarea
						value={data}
						onChange={(event) => onChange(event.target.value)}
						onBlur={props.onBlur}
						placeholder="0x…"
						spellCheck={false}
						className={cx(
							inputClass(props.invalid),
							'min-h-[76px] resize-y break-all',
						)}
					/>
					{byteLength > 0 && (
						<span className="type-card text-content-dimmed">
							{byteLength} bytes
							{byteLength > MAX_URL_CALLDATA_BYTES &&
								' · too long for a shareable link'}
						</span>
					)}
				</>
			)}
		</Field>
	)
}

/**
 * An optional input, collapsed to one row until it is wanted.
 *
 * Collapsed it shows its current value when that value is non-default, so
 * "there is an override in effect" is never hidden — the row is progressive
 * disclosure, not a secret.
 */
export function OptionalRow(props: {
	icon: React.ReactNode
	label: string
	summary?: string | undefined
	onReset?: () => void
	children: React.ReactNode
}): React.JSX.Element {
	const set = props.summary !== undefined
	const [open, setOpen] = React.useState(false)

	if (!open)
		return (
			<div className="flex items-center gap-[8px]">
				<button
					type="button"
					onClick={() => setOpen(true)}
					className="flex min-w-0 flex-1 items-center gap-[8px] text-left type-card text-tertiary cursor-pointer press-down hover:text-secondary"
				>
					<span className="shrink-0 text-content-dimmed">{props.icon}</span>
					<span className="shrink-0">{props.label}</span>
					{set && (
						<span className="min-w-0 truncate type-card-data text-primary">
							{props.summary}
						</span>
					)}
					<span className="ml-auto shrink-0 text-content-dimmed">
						{set ? (
							<ChevronDownIcon className="size-[12px]" />
						) : (
							<PlusIcon className="size-[12px]" />
						)}
					</span>
				</button>
				{set && props.onReset && (
					<button
						type="button"
						onClick={props.onReset}
						title={`Reset ${props.label.toLowerCase()}`}
						className="shrink-0 text-content-dimmed cursor-pointer press-down hover:text-negative"
					>
						<Trash2Icon className="size-[12px]" />
					</button>
				)}
			</div>
		)

	return (
		<div className="flex flex-col gap-[8px] rounded-[8px] border border-card-border bg-card-header p-[9px]">
			<div className="flex items-center gap-[8px]">
				<span className="shrink-0 text-content-dimmed">{props.icon}</span>
				<span className="type-card text-secondary">{props.label}</span>
				<button
					type="button"
					onClick={() => setOpen(false)}
					title="Collapse"
					className="ml-auto shrink-0 text-tertiary cursor-pointer press-down hover:text-primary"
				>
					<XIcon className="size-[12px]" />
				</button>
			</div>
			{props.children}
		</div>
	)
}
