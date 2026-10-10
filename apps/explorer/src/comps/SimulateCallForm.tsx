/**
 * The simulator's input pane.
 *
 * Structure, top to bottom: context (network + block), then the call itself
 * (from → to → calldata), then everything else behind additive rows. The rows
 * matter — a gas limit of 500,000,000 sitting permanently on screen is a
 * nine-digit number the user never chose, and it was the most confusing thing
 * on the empty page. Nothing is visible unless it was asked for.
 */

import { IconButton, style } from '@tempoxyz/ds/platform'
import * as OxAddress from 'ox/Address'
import * as OxHex from 'ox/Hex'
import * as React from 'react'
import type { Abi, AbiFunction } from 'viem'
import {
	decodeFunctionData,
	encodeFunctionData,
	getFunctionSelector,
} from 'viem'
import { cx } from 'zyzz'
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
import { pressDown, transitionColors, truncate } from '#styles/explorer'
import {
	Button,
	buttonIcon,
	Chip,
	Field,
	fieldInput,
	fieldInputInvalid,
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
		<div {...styles.root()}>
			<ContextBar
				form={form}
				setForm={setForm}
				blockInvalid={shows('block', errors.block)}
				onBlockBlur={() => touch('block')}
			/>

			<div {...styles.body()}>
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
					icon={<ZapIcon {...styles.rowIcon()} />}
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
							{...cx(
								fieldInput(),
								shows('gas', errors.gas) && fieldInputInvalid(),
							)}
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
						{...styles.addCall()}
						title="Run several calls in order against each other's state, the way a Tempo batch transaction executes"
					>
						<PlusIcon {...buttonIcon()} />
						Add a call
					</Button>
				)}

				{isBatch && (
					<p {...cx(styles.text(), styles.tertiary())}>
						Calls run in order against each other{'’'}s state, the way a Tempo
						batch transaction executes.
					</p>
				)}

				{props.formError && (
					<p {...cx(styles.text(), styles.negative())}>{props.formError}</p>
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
		<div {...styles.context()}>
			<div {...styles.contextRow()}>
				<span {...cx(styles.text(), styles.tertiary())}>Simulate against</span>
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
					{...cx(fieldInput(), props.blockInvalid && fieldInputInvalid())}
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
		<div {...styles.load()}>
			<label {...cx(styles.text(), styles.tertiary())} htmlFor={id}>
				Replay an existing transaction
			</label>
			<div {...styles.loadRow()}>
				<input
					id={id}
					value={props.value}
					onChange={(event) => props.onChange(event.target.value)}
					onKeyDown={(event) => event.key === 'Enter' && props.onLoad()}
					placeholder="0x transaction hash"
					{...fieldInput()}
				/>
				<Button onClick={props.onLoad} disabled={props.loading}>
					<DownloadIcon {...buttonIcon()} />
					{props.loading ? 'Loading…' : 'Load'}
				</Button>
			</div>
			{props.error && (
				<span {...cx(styles.text(), styles.negative())}>{props.error}</span>
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
		<div {...styles.steps()}>
			<span {...cx(styles.text(), styles.tertiary())}>
				Calls
				<span {...styles.stepsCount()}>{props.calls.length} in order</span>
			</span>
			<div {...styles.stepList()}>
				{props.calls.map((call, index) => {
					const selected = index === props.step
					return (
						<div key={index} {...styles.stepItem()}>
							<button
								type="button"
								onClick={() => props.onSelect(index)}
								title={call.to || `Call ${index + 1}`}
								{...cx(
									styles.stepTab(),
									pressDown(),
									transitionColors(),
									!selected && styles.stepTabIdle(),
									selected && styles.stepTabSelected(),
								)}
							>
								<span {...styles.stepIndex()}>{index + 1}</span>
								<span {...styles.mono()}>
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
									{...styles.stepRemove()}
								>
									<XIcon {...styles.stepRemoveIcon()} />
								</button>
							)}
						</div>
					)
				})}
				<button
					type="button"
					onClick={props.onAdd}
					title="Add a call"
					{...cx(styles.stepAdd(), pressDown(), transitionColors())}
				>
					<PlusIcon {...styles.icon12()} />
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
		<div {...styles.callFields()}>
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
				icon={<LayersIcon {...styles.rowIcon()} />}
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
						{...cx(
							fieldInput(),
							shows(valueKey, props.errors.value) && fieldInputInvalid(),
						)}
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
			{...cx(fieldInput(), props.invalid && fieldInputInvalid())}
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
					<span {...cx(styles.text(), styles.tertiary())}>
						no ABI · hex only
					</span>
				) : undefined
			}
		>
			{mismatch && mode === 'decoded' && (
				<div {...styles.mismatch()}>
					This calldata doesn{'’'}t match any function in the contract{'’'}s ABI
					— showing hex.
				</div>
			)}

			{showDecoded ? (
				<div {...styles.decoded()}>
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
						{...fieldInput()}
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
						<div key={`${input.name}-${input.type}-${index}`} {...styles.arg()}>
							<span {...cx(styles.text(), styles.tertiary())}>
								{input.name || `arg ${index}`}
								<span {...styles.argType()}>{input.type}</span>
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
									{...cx(fieldInput(), styles.argTextarea())}
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
									{...fieldInput()}
								/>
							)}
						</div>
					))}

					{data && data !== '0x' && (
						<div {...styles.encoded()}>
							<span {...cx(styles.encodedData(), truncate())}>{data}</span>
							<span {...cx(styles.shrink(), styles.tertiary())}>
								{byteLength} bytes
							</span>
							<IconButton
								aria-label="Copy calldata"
								onClick={() => copy.copy(data)}
								scale="small"
								title="Copy calldata"
								variant="tertiary"
								{...cx(styles.iconButton(), pressDown())}
							>
								{copy.notifying ? <CheckIcon /> : <CopyIcon />}
							</IconButton>
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
						{...cx(
							fieldInput(),
							props.invalid && fieldInputInvalid(),
							styles.hexTextarea(),
						)}
					/>
					{byteLength > 0 && (
						<span {...cx(styles.text(), styles.tertiary())}>
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
			<div {...styles.optional()}>
				<button
					type="button"
					onClick={() => setOpen(true)}
					{...cx(styles.optionalToggle(), pressDown(), transitionColors())}
				>
					<span {...cx(styles.shrink(), styles.tertiary())}>{props.icon}</span>
					<span {...styles.shrink()}>{props.label}</span>
					{set && (
						<span {...cx(styles.optionalSummary(), truncate())}>
							{props.summary}
						</span>
					)}
					<span {...cx(styles.shrink(), styles.tertiary(), styles.pushRight())}>
						{set ? (
							<ChevronDownIcon {...styles.icon12()} />
						) : (
							<PlusIcon {...styles.icon12()} />
						)}
					</span>
				</button>
				{set && props.onReset && (
					<IconButton
						aria-label={`Reset ${props.label.toLowerCase()}`}
						onClick={props.onReset}
						scale="small"
						title={`Reset ${props.label.toLowerCase()}`}
						variant="tertiary"
						{...cx(styles.iconButton(), styles.resetButton(), pressDown())}
					>
						<Trash2Icon />
					</IconButton>
				)}
			</div>
		)

	return (
		<div {...styles.optionalOpen()}>
			<div {...styles.optional()}>
				<span {...cx(styles.shrink(), styles.tertiary())}>{props.icon}</span>
				<span {...cx(styles.text(), styles.secondary())}>{props.label}</span>
				<IconButton
					aria-label="Collapse"
					onClick={() => setOpen(false)}
					scale="small"
					title="Collapse"
					variant="tertiary"
					{...cx(styles.iconButton(), styles.pushRight(), pressDown())}
				>
					<XIcon />
				</IconButton>
			</div>
			{props.children}
		</div>
	)
}

namespace styles {
	export const text = style({ margin: 'none', typography: 'body.b2' })

	export const secondary = style({ color: 'content.secondary' })

	export const tertiary = style({ color: 'content.tertiary' })

	export const negative = style({ color: 'content.negative' })

	export const mono = style({ typography: 'mono.inline' })

	export const shrink = style({ flexShrink: 0 })

	export const pushRight = style({ marginLeft: 'auto !custom' })

	export const icon12 = style({
		flexShrink: 0,
		height: '12px !custom',
		width: '12px !custom',
	})

	export const rowIcon = style({
		height: '13px !custom',
		width: '13px !custom',
	})

	// IconButton owns size and fill; this adds only hover and placement.
	export const iconButton = style({
		flexShrink: 0,
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.regular' },
		},
	})

	export const resetButton = style({
		'@media (hover: hover)': { ':hover': { color: 'content.negative' } },
	})

	export const root = style({
		display: 'flex',
		flexDirection: 'column',
		minWidth: '0 !custom',
	})

	export const body = style({
		display: 'flex',
		flex: 1,
		flexDirection: 'column',
		gap: '16',
		minWidth: '0 !custom',
		overflowY: 'auto',
		paddingBlock: '16',
		paddingInline: '16',
	})

	export const addCall = style({
		marginTop: '2',
		width: 'fit-content !custom',
	})

	export const context = style({
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		paddingBlock: '12',
		paddingInline: '16',
	})

	export const contextRow = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		justifyContent: 'space-between',
	})

	export const load = style({
		borderColor: 'line.secondary',
		borderRadius: 'xs',
		borderStyle: 'solid',
		borderWidth: 'regular',
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		paddingBlock: '8',
		paddingInline: '12',
	})

	export const loadRow = style({ display: 'flex', gap: '8' })

	export const steps = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
	})

	export const stepsCount = style({
		color: 'content.tertiary',
		marginLeft: '8',
	})

	export const stepList = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '8',
	})

	// Marks the call for the remove button's hover reveal.
	export const stepItem = style({ position: 'relative' })

	export const stepTab = style({
		alignItems: 'center',
		borderRadius: '2xs',
		borderStyle: 'solid',
		borderWidth: 'regular',
		boxSizing: 'border-box',
		cursor: 'pointer',
		display: 'flex',
		gap: '8',
		height: '28px !custom',
		paddingInline: '8',
		typography: 'body.b2',
	})

	export const stepTabIdle = style({
		borderColor: 'line.secondary',
		color: 'content.tertiary',
		'@media (hover: hover)': { ':hover': { color: 'content.secondary' } },
	})

	export const stepTabSelected = style({
		backgroundColor: 'container.regular',
		borderColor: 'border.focus',
		color: 'content.primary',
	})

	export const stepIndex = style({
		alignItems: 'center',
		backgroundColor: 'container.strong',
		borderRadius: 'full',
		color: 'content.tertiary',
		display: 'flex',
		flexShrink: 0,
		height: '15px !custom',
		justifyContent: 'center',
		typography: 'body.b3',
		width: '15px !custom',
	})

	export const stepRemove = style({
		alignItems: 'center',
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderRadius: 'full',
		borderStyle: 'solid',
		borderWidth: 'regular',
		boxSizing: 'border-box',
		color: 'content.tertiary',
		cursor: 'pointer',
		display: 'none',
		height: '15px !custom',
		justifyContent: 'center',
		position: 'absolute',
		right: '-5px !custom',
		top: '-5px !custom',
		width: '15px !custom',
		'@media (hover: hover)': {
			':hover': { color: 'content.negative' },
			selectors: { [`${stepItem}:hover &`]: { display: 'flex' } },
		},
	})

	export const stepRemoveIcon = style({
		height: '9px !custom',
		width: '9px !custom',
	})

	export const stepAdd = style({
		alignItems: 'center',
		borderColor: 'line.secondary',
		borderRadius: '2xs',
		borderStyle: 'solid',
		borderWidth: 'regular',
		boxSizing: 'border-box',
		color: 'content.tertiary',
		cursor: 'pointer',
		display: 'flex',
		height: '26px !custom',
		justifyContent: 'center',
		width: '26px !custom',
		'@media (hover: hover)': {
			':hover': { borderColor: 'border.focus', color: 'content.primary' },
		},
	})

	export const callFields = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
	})

	export const mismatch = style({
		backgroundColor: 'container.warning',
		borderColor: 'border.warning',
		borderRadius: '2xs',
		borderStyle: 'solid',
		borderWidth: 'regular',
		color: 'content.secondary',
		paddingBlock: '8',
		paddingInline: '8',
		typography: 'body.b2',
	})

	export const decoded = style({
		borderColor: 'line.secondary',
		borderRadius: 'xs',
		borderStyle: 'solid',
		borderWidth: 'regular',
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		padding: '8',
	})

	export const arg = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
	})

	export const argType = style({
		color: 'content.tertiary',
		marginLeft: '8',
		typography: 'mono.inline',
	})

	export const argTextarea = style({
		minHeight: '56px !custom',
		resize: 'vertical',
	})

	export const encoded = style({
		alignItems: 'center',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		borderTopWidth: 'regular',
		display: 'flex',
		gap: '8',
		paddingTop: '8',
		typography: 'body.b2',
	})

	export const encodedData = style({
		color: 'content.tertiary',
		flex: 1,
		fontVariantNumeric: 'tabular-nums',
		minWidth: '0 !custom',
		typography: 'body.b2',
	})

	export const hexTextarea = style({
		minHeight: '76px !custom',
		resize: 'vertical',
		wordBreak: 'break-all',
	})

	export const optional = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
	})

	export const optionalToggle = style({
		alignItems: 'center',
		color: 'content.tertiary',
		cursor: 'pointer',
		display: 'flex',
		flex: 1,
		gap: '8',
		minWidth: '0 !custom',
		textAlign: 'left',
		typography: 'body.b2',
		'@media (hover: hover)': { ':hover': { color: 'content.secondary' } },
	})

	export const optionalSummary = style({
		color: 'content.primary',
		fontVariantNumeric: 'tabular-nums',
		minWidth: '0 !custom',
		typography: 'body.b2',
	})

	export const optionalOpen = style({
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderRadius: 'xs',
		borderStyle: 'solid',
		borderWidth: 'regular',
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		padding: '8',
	})
}
