/**
 * The simulator's input pane, laid out as the TDS Forms pattern: a titled
 * frame, one fieldset per idea (a transaction to replay, the call, the state
 * it runs against), and the primary action in the footer.
 */

import {
	Button,
	Callout,
	Checkbox,
	ChoiceGroup,
	Field,
	Fieldset,
	Frame,
	formatHex,
	Hex,
	Input,
	Kbd,
	Select,
	style,
	Surface,
	Textarea,
	Tooltip,
} from '@tempoxyz/ds'
import { Play, Plus } from '@tempoxyz/ds/icons'
import * as OxAddress from 'ox/Address'
import * as OxHex from 'ox/Hex'
import * as React from 'react'
import type { Abi, AbiFunction } from 'viem'
import {
	decodeFunctionData,
	encodeFunctionData,
	getFunctionSelector,
} from 'viem'
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
import { useAutoloadAbi } from '#lib/queries'
import { inputValueToString } from './SimulateShared'

const ADDRESS_ERROR = 'Enter a 42-character address that starts with 0x.'
const WHOLE_NUMBER_ERROR = 'Enter a whole number, such as 0.'

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
	// Errors show once a field loses focus, or on every field after a failed
	// run, so a partial value is never flagged while it is typed.
	const submitted = Boolean(props.formError)
	const shows = React.useCallback(
		(key: string, invalid: boolean) =>
			invalid && (submitted || touched.has(key)),
		[submitted, touched],
	)

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
	const addCall = () => {
		setForm((current) => ({
			...current,
			calls: [...current.calls, emptyCall],
		}))
		props.onStepChange(form.calls.length)
	}

	const titleId = React.useId()

	return (
		<Surface
			render={
				<form
					aria-labelledby={titleId}
					noValidate
					onSubmit={(event) => {
						event.preventDefault()
						props.onRun()
					}}
				/>
			}
			size="medium"
			{...styles.card()}
		>
			<Surface.Header>
				<Surface.Title id={titleId}>Simulate a call</Surface.Title>
			</Surface.Header>
			<Surface.Description>
				Runs against the chain{'’'}s state. Nothing is signed or broadcast.
			</Surface.Description>
			<Frame.Root>
				<Fieldset.Root>
					<Fieldset.Legend>Existing transaction</Fieldset.Legend>
					<ReplayField
						value={props.loadHash}
						onChange={props.setLoadHash}
						onLoad={props.onLoad}
						loading={props.loadingTransaction}
						error={props.loadError}
					/>
				</Fieldset.Root>

				<Fieldset.Root>
					<Fieldset.Legend>{isBatch ? 'Calls' : 'Call'}</Fieldset.Legend>
					<Field.Root invalid={shows('from', errors.from)}>
						<Field.Label>From</Field.Label>
						<AddressInput
							value={form.from}
							onChange={(value) =>
								setForm((current) => ({ ...current, from: value }))
							}
							onBlur={() => touch('from')}
						/>
						<Field.Description>
							Leave it empty to send from the zero address.
						</Field.Description>
						<Field.Error match={shows('from', errors.from)}>
							{ADDRESS_ERROR}
						</Field.Error>
					</Field.Root>

					{isBatch && (
						<CallPicker
							calls={form.calls}
							step={step}
							onSelect={props.onStepChange}
							onAdd={addCall}
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
						shows={shows}
						onTouch={touch}
						onChange={(patch) => updateCall(step, patch)}
					/>

					{!isBatch && (
						<Button
							size="small"
							variant="secondary"
							onClick={addCall}
							{...styles.start()}
						>
							<Plus />
							Add a call
						</Button>
					)}
				</Fieldset.Root>

				<Fieldset.Root>
					<Fieldset.Legend>Execution</Fieldset.Legend>
					<BlockField
						block={form.block}
						onChange={(block) => setForm((current) => ({ ...current, block }))}
						invalid={shows('block', errors.block)}
						onBlur={() => touch('block')}
					/>
					<GasField
						gas={form.gas}
						defaultGas={props.defaultGas}
						invalid={shows('gas', errors.gas)}
						onChange={(gas) => setForm((current) => ({ ...current, gas }))}
						onBlur={() => touch('gas')}
					/>
				</Fieldset.Root>

				<Frame.Footer {...styles.footer()}>
					{props.formError && (
						<Callout intent="negative">
							<Callout.Icon />
							<Callout.Content>{props.formError}</Callout.Content>
						</Callout>
					)}
					<Frame.Actions>
						{props.canClear && (
							<Button variant="secondary" onClick={props.onClear}>
								Clear
							</Button>
						)}
						{/* The button declares the shortcut; the hint is for sight. */}
						<Kbd aria-hidden mod {...styles.center()}>
							Enter
						</Kbd>
						<Button aria-keyshortcuts="Meta+Enter Control+Enter" type="submit">
							<Play />
							Simulate call
						</Button>
					</Frame.Actions>
				</Frame.Footer>
			</Frame.Root>
		</Surface>
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
		/** Runs the call. The form's submit and the Mod+Enter shortcut call it. */
		onRun: () => void
		/** Whether there is a draft or a result to clear. */
		canClear: boolean
		onClear: () => void
	}
}

/** The block whose state the call runs against. */
function BlockField(props: {
	block: string
	onChange: (block: string) => void
	invalid: boolean
	onBlur: () => void
}): React.JSX.Element {
	const pinned = props.block !== 'latest'
	return (
		<>
			<Field.Root>
				<Field.Label>Block</Field.Label>
				<ChoiceGroup.Root
					onValueChange={(value) =>
						props.onChange(value === 'latest' ? 'latest' : '')
					}
					value={pinned ? 'pinned' : 'latest'}
					{...styles.start()}
				>
					<ChoiceGroup.Item value="latest">Latest</ChoiceGroup.Item>
					<ChoiceGroup.Item value="pinned">Pinned</ChoiceGroup.Item>
				</ChoiceGroup.Root>
			</Field.Root>
			{pinned && (
				<Field.Root invalid={props.invalid}>
					<Field.Label>Block hash</Field.Label>
					<Input.Group>
						<Input.Control
							autoCapitalize="off"
							autoComplete="off"
							value={props.block}
							onValueChange={props.onChange}
							onBlur={props.onBlur}
							placeholder="0x…"
							spellCheck={false}
						/>
					</Input.Group>
					<Field.Description>
						The call runs against the state after this block.
					</Field.Description>
					<Field.Error match={props.invalid}>
						Enter a 66-character block hash that starts with 0x.
					</Field.Error>
				</Field.Root>
			)}
		</>
	)
}

/** Replaying is another route to a call, so it has its own fieldset. */
function ReplayField(props: {
	value: string
	onChange: (value: string) => void
	onLoad: () => void
	loading: boolean
	error: string | null
}): React.JSX.Element {
	return (
		<Field.Root invalid={Boolean(props.error)}>
			<Field.Label>Transaction hash</Field.Label>
			<div {...styles.row()}>
				<Input.Group {...styles.fill()}>
					<Input.Control
						autoCapitalize="off"
						autoComplete="off"
						value={props.value}
						onValueChange={props.onChange}
						onKeyDown={(event) => {
							// Enter replays here rather than submitting the form.
							if (event.key !== 'Enter') return
							event.preventDefault()
							props.onLoad()
						}}
						placeholder="0x…"
						spellCheck={false}
					/>
				</Input.Group>
				<Button
					loading={props.loading}
					variant="secondary"
					onClick={props.onLoad}
				>
					Replay
				</Button>
			</div>
			<Field.Description>
				Fills in its calls and runs them against its parent block.
			</Field.Description>
			<Field.Error match={Boolean(props.error)}>{props.error}</Field.Error>
		</Field.Root>
	)
}

/**
 * Which call of a batch is being edited. Outcomes live on the result pane, not
 * here: this control is for composing.
 */
function CallPicker(props: {
	calls: readonly CallDraft[]
	step: number
	onSelect: (index: number) => void
	onAdd: () => void
	onRemove: (index: number) => void
}): React.JSX.Element {
	return (
		<div {...styles.group()}>
			<Field.Root>
				<Field.Label>Call to edit</Field.Label>
				<div {...styles.row()}>
					<ChoiceGroup.Root
						onValueChange={(value) => props.onSelect(Number(value))}
						value={String(props.step)}
						variant="chips"
						{...styles.fill()}
					>
						{props.calls.map((call, index) => (
							<ChoiceGroup.Item key={index} value={String(index)}>
								{index + 1}. {call.to ? formatHex(call.to) : 'Empty'}
							</ChoiceGroup.Item>
						))}
					</ChoiceGroup.Root>
					<Tooltip.Root>
						<Tooltip.Trigger
							render={
								<Button
									aria-label="Add a call"
									onClick={props.onAdd}
									shape="icon"
									variant="secondary"
									{...styles.shrink()}
								/>
							}
						>
							<Plus />
						</Tooltip.Trigger>
						<Tooltip.Popup>Add a call</Tooltip.Popup>
					</Tooltip.Root>
				</div>
				<Field.Description>
					Calls run in order against each other{'’'}s state, the way a Tempo
					batch transaction executes.
				</Field.Description>
			</Field.Root>
			<Button
				size="small"
				variant="text"
				onClick={() => props.onRemove(props.step)}
				{...styles.start()}
			>
				Remove call {props.step + 1}
			</Button>
		</div>
	)
}

function CallFields(props: {
	call: CallDraft
	index: number
	errors: { to: boolean; data: boolean; value: boolean }
	shows: (key: string, invalid: boolean) => boolean
	onTouch: (key: string) => void
	onChange: (patch: Partial<CallDraft>) => void
}): React.JSX.Element {
	const { call, index } = props
	const address = OxAddress.validate(call.to)
		? (call.to as OxAddress.Address)
		: undefined
	const { data: abi } = useAutoloadAbi({ address, enabled: Boolean(address) })
	const toKey = `to-${index}`
	const dataKey = `data-${index}`
	const valueKey = `value-${index}`
	const valueInvalid = props.shows(valueKey, props.errors.value)

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
		<>
			<Field.Root invalid={props.shows(toKey, props.errors.to)}>
				<Field.Label>To</Field.Label>
				<AddressInput
					value={call.to}
					onChange={(value) => props.onChange({ to: value })}
					onBlur={() => props.onTouch(toKey)}
				/>
				<Field.Description>
					{resolvedName ?? 'The contract to call.'}
				</Field.Description>
				<Field.Error match={props.shows(toKey, props.errors.to)}>
					{ADDRESS_ERROR}
				</Field.Error>
			</Field.Root>

			<CalldataField
				abi={abi as Abi | undefined}
				// "No ABI" is only a fact once there is an address to have failed to
				// resolve. On an empty form it is just a scold.
				hasTarget={Boolean(address)}
				data={call.data}
				invalid={props.shows(dataKey, props.errors.data)}
				onBlur={() => props.onTouch(dataKey)}
				onChange={(data) => props.onChange({ data })}
			/>

			<Field.Root invalid={valueInvalid}>
				<Field.Label>Value</Field.Label>
				<Input.Group>
					<Input.Control
						autoComplete="off"
						inputMode="numeric"
						value={call.value}
						onValueChange={(value) => props.onChange({ value })}
						onBlur={() => props.onTouch(valueKey)}
					/>
				</Input.Group>
				<Field.Description>A whole number, in base units.</Field.Description>
				<Field.Error match={valueInvalid}>{WHOLE_NUMBER_ERROR}</Field.Error>
			</Field.Root>
		</>
	)
}

function AddressInput(props: {
	value: string
	onChange: (value: string) => void
	onBlur: () => void
}): React.JSX.Element {
	return (
		<Input.Group>
			<Input.Control
				autoCapitalize="off"
				autoComplete="off"
				value={props.value}
				onValueChange={props.onChange}
				onBlur={props.onBlur}
				placeholder="0x…"
				spellCheck={false}
			/>
		</Input.Group>
	)
}

/**
 * One value, two ways to write it. The function picker lives inside the
 * calldata control, because picking a function is choosing how to write the
 * same bytes; a separate picker could show one call while running another.
 */
function CalldataField(props: {
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
				// Incomplete input while typing: the hex keeps its last good value.
			}
		},
		[onChange],
	)

	const setValue = (fn: AbiFunction, index: number, value: string) => {
		const next = values.map((current, itemIndex) =>
			itemIndex === index ? value : current,
		)
		setValues(next)
		encode(fn, next)
	}

	// Labels for the function picker, so the trigger shows `name(types)` rather
	// than the selector it stores.
	const functionItems = React.useMemo(
		() =>
			functions.map((fn) => ({
				value: getFunctionSelector(fn),
				label: `${fn.name || getFunctionSelector(fn)}(${fn.inputs.map((input) => input.type).join(', ')})`,
			})),
		[functions],
	)

	const canDecode = functions.length > 0
	const showDecoded = canDecode && mode === 'decoded' && !mismatch
	const byteLength = OxHex.validate(data) ? OxHex.size(data) : 0
	const hexDescription = [
		props.hasTarget && !abi
			? 'No ABI was found for this contract, so enter the calldata as hex.'
			: undefined,
		byteLength > MAX_URL_CALLDATA_BYTES
			? `${byteLength.toLocaleString()} bytes, too long for a shareable link.`
			: byteLength > 0
				? `${byteLength.toLocaleString()} bytes.`
				: 'Hex data that starts with 0x.',
	]
		.filter(Boolean)
		.join(' ')

	return (
		<div {...styles.group()}>
			{canDecode && (
				<ChoiceGroup.Root
					aria-label="Calldata format"
					onValueChange={setMode}
					size="small"
					value={mode}
					{...styles.start()}
				>
					<ChoiceGroup.Item value="decoded">Decoded</ChoiceGroup.Item>
					<ChoiceGroup.Item value="hex">Hex</ChoiceGroup.Item>
				</ChoiceGroup.Root>
			)}

			{mismatch && mode === 'decoded' && (
				<Callout intent="warning">
					<Callout.Icon />
					<Callout.Content>
						This calldata doesn{'’'}t match a function in the contract{'’'}s
						ABI, so it shows as hex.
					</Callout.Content>
				</Callout>
			)}

			{showDecoded ? (
				<>
					<Field.Root>
						<Field.Label>Function</Field.Label>
						<Select.Root
							items={functionItems}
							value={selector || null}
							onValueChange={(value) => {
								const next = value ?? ''
								setSelector(next)
								const fn = functions.find(
									(candidate) => getFunctionSelector(candidate) === next,
								)
								if (!fn) return
								const blank = fn.inputs.map(() => '')
								setValues(blank)
								if (fn.inputs.length === 0) encode(fn, blank)
							}}
						>
							<Select.Trigger>
								<Select.Value placeholder="Select a function" />
								<Select.Icon />
							</Select.Trigger>
							<Select.Popup>
								{functionItems.map((item) => (
									<Select.Item key={item.value} value={item.value}>
										<Select.ItemText>{item.label}</Select.ItemText>
									</Select.Item>
								))}
							</Select.Popup>
						</Select.Root>
					</Field.Root>

					{selected?.inputs.map((input, index) => (
						<ArgumentField
							key={`${input.name}-${input.type}-${index}`}
							name={input.name || `Argument ${index + 1}`}
							type={input.type}
							placeholder={getPlaceholder(input)}
							value={values[index] ?? ''}
							onChange={(value) => setValue(selected, index, value)}
						/>
					))}

					{data && data !== '0x' && (
						<div {...styles.encoded()}>
							<Hex.Root value={data} {...styles.fill()}>
								<Hex.Text />
								<Hex.Copy aria-label="Copy calldata" />
							</Hex.Root>
							<span {...styles.secondary()}>
								{byteLength.toLocaleString()} bytes
							</span>
						</div>
					)}
				</>
			) : (
				<Field.Root invalid={props.invalid}>
					<Field.Label>Calldata</Field.Label>
					<Textarea
						autoCapitalize="off"
						autoComplete="off"
						value={data}
						onChange={(event) => onChange(event.target.value)}
						onBlur={props.onBlur}
						placeholder="0x…"
						rows={4}
						spellCheck={false}
					/>
					<Field.Description>{hexDescription}</Field.Description>
					<Field.Error match={props.invalid}>
						Enter hex data that starts with 0x.
					</Field.Error>
				</Field.Root>
			)}
		</div>
	)
}

/** One argument of the picked function, labelled by name, typed in the hint. */
function ArgumentField(props: {
	name: string
	type: string
	placeholder: string
	value: string
	onChange: (value: string) => void
}): React.JSX.Element {
	const kind = getInputType(props.type)
	if (kind === 'checkbox')
		return (
			<Field.Root>
				<Field.Item>
					<Checkbox
						checked={props.value === 'true'}
						onCheckedChange={(checked) => props.onChange(String(checked))}
					/>
					<Field.Label>{props.name}</Field.Label>
				</Field.Item>
			</Field.Root>
		)
	return (
		<Field.Root>
			<Field.Label>{props.name}</Field.Label>
			{kind === 'textarea' ? (
				<Textarea
					autoComplete="off"
					rows={2}
					value={props.value}
					onChange={(event) => props.onChange(event.target.value)}
					placeholder={props.placeholder}
					spellCheck={false}
				/>
			) : (
				<Input.Group>
					<Input.Control
						autoCapitalize="off"
						autoComplete="off"
						value={props.value}
						onValueChange={props.onChange}
						placeholder={props.placeholder}
						spellCheck={false}
					/>
				</Input.Group>
			)}
			<Field.Description>{props.type}</Field.Description>
		</Field.Root>
	)
}

/** The gas each call may use, which defaults to the block's limit. */
function GasField(props: {
	gas: string
	defaultGas: string
	invalid: boolean
	onChange: (gas: string) => void
	onBlur: () => void
}): React.JSX.Element {
	const defaultGas = Number(props.defaultGas).toLocaleString()
	return (
		<>
			<Field.Root invalid={props.invalid}>
				<Field.Label>Gas limit</Field.Label>
				<Input.Group>
					<Input.Control
						autoComplete="off"
						inputMode="numeric"
						value={props.gas}
						onValueChange={props.onChange}
						onBlur={props.onBlur}
					/>
				</Input.Group>
				<Field.Description>The block limit is {defaultGas}.</Field.Description>
				<Field.Error match={props.invalid}>
					Enter a whole number, such as the block limit of {defaultGas}.
				</Field.Error>
			</Field.Root>
			{props.gas !== props.defaultGas && (
				<Button
					size="small"
					variant="text"
					onClick={() => props.onChange(props.defaultGas)}
					{...styles.start()}
				>
					Use the block limit
				</Button>
			)}
		</>
	)
}

namespace styles {
	// Surface owns the fill, border, radius, and padding; as a grid item it
	// also needs to shrink.
	export const card = style({ minWidth: '0 !custom' })

	export const footer = style({ rowGap: '16' })

	// The shortcut hint is shorter than the buttons beside it.
	export const center = style({ alignSelf: 'center' })

	export const group = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '16',
		minWidth: '0 !custom',
	})

	export const row = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		minWidth: '0 !custom',
	})

	// A flex column stretches its items; these keep their own width.
	export const start = style({ alignSelf: 'flex-start' })

	export const fill = style({ flex: 1, minWidth: '0 !custom' })

	export const shrink = style({ flexShrink: 0 })

	export const secondary = style({
		color: 'gray.900',
		flexShrink: 0,
		typography: 'label.13',
	})

	export const encoded = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		minWidth: '0 !custom',
	})
}
