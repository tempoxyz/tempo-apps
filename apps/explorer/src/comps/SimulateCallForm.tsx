/**
 * The simulator's input pane.
 *
 * Structure, top to bottom: context (network + block), then the call itself
 * (from → to → calldata), then everything else behind additive rows. The rows
 * matter — a gas limit of 500,000,000 sitting permanently on screen is a
 * nine-digit number the user never chose, and it was the most confusing thing
 * on the empty page. Nothing is visible unless it was asked for.
 */

import {
	Button,
	Callout,
	Checkbox,
	Field as TdsField,
	Input,
	Select,
	Tag,
	Textarea,
	Tooltip,
	style,
} from '@tempoxyz/ds'
import {
	ChevronDown,
	Close,
	Delete,
	Download,
	Layers,
	Lightning,
	Plus,
} from '@tempoxyz/ds/icons'
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
import { CopyButton } from '#comps/CopyButton'
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
import { useAutoloadAbi } from '#lib/queries'
import {
	pressDown,
	textField,
	transitionColors,
	truncate,
} from '#styles/explorer'
import { ViewToggle } from './PanelToolbar'
import {
	ErrorText,
	Field,
	fieldHintId,
	inputValueToString,
} from './SimulateShared'

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
	const fromId = React.useId()
	const gasId = React.useId()

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

				<Field
					label="From"
					htmlFor={fromId}
					invalid={shows('from', errors.from)}
				>
					<AddressInput
						id={fromId}
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
					icon={<Lightning />}
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
						htmlFor={gasId}
						invalid={shows('gas', errors.gas)}
						hint={
							shows('gas', errors.gas)
								? 'Whole numbers only.'
								: `Block limit is ${Number(props.defaultGas).toLocaleString()}.`
						}
					>
						<Input.Group invalid={shows('gas', errors.gas)}>
							<Input.Control
								id={gasId}
								value={form.gas}
								inputMode="numeric"
								onValueChange={(gas) =>
									setForm((current) => ({ ...current, gas }))
								}
								onBlur={() => touch('gas')}
								aria-describedby={fieldHintId(gasId)}
							/>
						</Input.Group>
					</Field>
				</OptionalRow>

				{/* Adding a call comes after the optional rows, so the run of `+` rows
				    stays unbroken and the batch action reads as its own step. */}
				{!isBatch && (
					<Button
						size="small"
						variant="secondary"
						onClick={() => {
							setForm((current) => ({
								...current,
								calls: [...current.calls, emptyCall],
							}))
							props.onStepChange(1)
						}}
						{...styles.addCall()}
					>
						<Plus />
						Add a call
					</Button>
				)}

				{isBatch && (
					<p {...cx(styles.text(), styles.secondary())}>
						Calls run in order against each other{'’'}s state, the way a Tempo
						batch transaction executes.
					</p>
				)}

				{props.formError && (
					<Callout intent="negative">
						<Callout.Icon />
						<Callout.Content>{props.formError}</Callout.Content>
					</Callout>
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
				<span {...cx(styles.text(), styles.secondary())}>Simulate against</span>
				<ViewToggle
					label="Simulate against"
					value={pinned ? 'pinned' : 'latest'}
					options={[
						{ value: 'latest', label: 'Latest' },
						{ value: 'pinned', label: 'Pinned block' },
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
				<Input.Group invalid={props.blockInvalid}>
					<Input.Control
						value={form.block}
						onValueChange={(block) =>
							setForm((current) => ({ ...current, block }))
						}
						onBlur={props.onBlockBlur}
						placeholder="0x block hash"
						aria-label="Pinned block hash"
						spellCheck={false}
					/>
				</Input.Group>
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
			<label {...cx(styles.text(), styles.secondary())} htmlFor={id}>
				Replay an existing transaction
			</label>
			<div {...styles.loadRow()}>
				<Input.Group invalid={Boolean(props.error)} {...styles.loadInput()}>
					<Input.Control
						id={id}
						value={props.value}
						onValueChange={props.onChange}
						onKeyDown={(event) => event.key === 'Enter' && props.onLoad()}
						placeholder="0x transaction hash"
						spellCheck={false}
						aria-describedby={props.error ? fieldHintId(id) : undefined}
					/>
				</Input.Group>
				<Button
					variant="secondary"
					onClick={props.onLoad}
					disabled={props.loading}
				>
					<Download />
					{props.loading ? 'Loading…' : 'Load'}
				</Button>
			</div>
			{props.error && <ErrorText id={fieldHintId(id)}>{props.error}</ErrorText>}
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
			<span {...cx(styles.text(), styles.secondary())}>
				Calls
				<span {...styles.stepsCount()}>{props.calls.length} in order</span>
			</span>
			{/* biome-ignore lint/a11y/useSemanticElements: a row of toggle buttons, not a form fieldset */}
			<div role="group" aria-label="Calls" {...styles.stepList()}>
				{props.calls.map((call, index) => {
					const selected = index === props.step
					return (
						<div key={index} {...styles.stepItem()}>
							<Button
								size="small"
								variant={selected ? 'secondary' : 'text'}
								aria-pressed={selected}
								onClick={() => props.onSelect(index)}
								title={call.to || undefined}
							>
								<span {...styles.stepIndex()}>{index + 1}</span>
								<span {...styles.mono()}>
									{call.to
										? HexFormatter.truncate(call.to as OxHex.Hex)
										: 'empty'}
								</span>
							</Button>
							{props.calls.length > 1 && (
								<Tooltip.Root>
									<Tooltip.Trigger
										render={
											<button
												type="button"
												aria-label={`Remove call ${index + 1}`}
												onClick={() => props.onRemove(index)}
												{...cx(styles.stepRemove(), transitionColors())}
											/>
										}
									>
										<Close {...styles.stepRemoveIcon()} />
									</Tooltip.Trigger>
									<Tooltip.Popup>{`Remove call ${index + 1}`}</Tooltip.Popup>
								</Tooltip.Root>
							)}
						</div>
					)
				})}
				<Tooltip.Root>
					<Tooltip.Trigger
						render={
							<Button
								aria-label="Add a call"
								onClick={props.onAdd}
								shape="icon"
								size="small"
								variant="secondary"
								{...styles.iconButton()}
							/>
						}
					>
						<Plus />
					</Tooltip.Trigger>
					<Tooltip.Popup>Add a call</Tooltip.Popup>
				</Tooltip.Root>
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
	const toId = React.useId()
	const valueId = React.useId()
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
				htmlFor={toId}
				invalid={shows(toKey, props.errors.to)}
				action={
					resolvedName ? (
						<Tag intent="neutral" title={call.to} {...styles.nameBadge()}>
							<span {...cx(truncate(), styles.nameBadgeText())}>
								{resolvedName}
							</span>
						</Tag>
					) : undefined
				}
			>
				<AddressInput
					id={toId}
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
				icon={<Layers />}
				label="Value"
				summary={call.value !== '0' ? call.value : undefined}
				onReset={() => props.onChange({ value: '0' })}
			>
				<Field
					label="Value"
					htmlFor={valueId}
					invalid={shows(valueKey, props.errors.value)}
					hint={
						shows(valueKey, props.errors.value)
							? 'Whole numbers only.'
							: undefined
					}
				>
					<Input.Group invalid={shows(valueKey, props.errors.value)}>
						<Input.Control
							id={valueId}
							value={call.value}
							inputMode="numeric"
							onValueChange={(value) => props.onChange({ value })}
							onBlur={() => props.onTouch(valueKey)}
							aria-describedby={
								shows(valueKey, props.errors.value)
									? fieldHintId(valueId)
									: undefined
							}
						/>
					</Input.Group>
				</Field>
			</OptionalRow>
		</div>
	)
}

function AddressInput(props: {
	id: string
	value: string
	onChange: (value: string) => void
	onBlur: () => void
	invalid: boolean
	placeholder: string
}): React.JSX.Element {
	return (
		<Input.Group invalid={props.invalid}>
			<Input.Control
				id={props.id}
				value={props.value}
				onValueChange={props.onChange}
				onBlur={props.onBlur}
				placeholder={props.placeholder}
				spellCheck={false}
			/>
		</Input.Group>
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
	const id = React.useId()
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
				// Incomplete input while typing — leave the hex at its last good value.
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

	return (
		<Field
			label="Calldata"
			htmlFor={id}
			action={
				canDecode ? (
					<ViewToggle
						label="Calldata format"
						value={mode}
						options={[
							{ value: 'decoded', label: 'Decoded' },
							{ value: 'hex', label: 'Hex' },
						]}
						onChange={setMode}
					/>
				) : props.hasTarget && !abi ? (
					// No ABI is a fact, not an error — say it once and stay usable.
					<span {...cx(styles.text(), styles.secondary())}>
						no ABI · hex only
					</span>
				) : undefined
			}
		>
			{mismatch && mode === 'decoded' && (
				<Callout intent="warning">
					<Callout.Icon />
					<Callout.Content>
						<strong {...styles.calloutTitle()}>
							This calldata doesn’t match any function in the contract’s ABI
						</strong>
						Showing hex.
					</Callout.Content>
				</Callout>
			)}

			{showDecoded ? (
				<div {...styles.decoded()}>
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
						<Select.Trigger id={id}>
							<Select.Value placeholder="Select a function…" />
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

					{selected?.inputs.map((input, index) => {
						const argId = `${id}-arg-${index}`
						const type = getInputType(input.type)
						const name = (
							<>
								{input.name || `arg ${index}`}
								<span {...styles.argType()}>{input.type}</span>
							</>
						)
						if (type === 'checkbox')
							return (
								// TDS Checkbox has no label of its own; the field links one.
								<TdsField.Root key={`${input.name}-${input.type}-${index}`}>
									<TdsField.Item>
										<Checkbox
											checked={values[index] === 'true'}
											onCheckedChange={(checked) =>
												setValue(selected, index, String(checked))
											}
										/>
										<TdsField.Label>{name}</TdsField.Label>
									</TdsField.Item>
								</TdsField.Root>
							)
						return (
							<div
								key={`${input.name}-${input.type}-${index}`}
								{...styles.arg()}
							>
								<label
									htmlFor={argId}
									{...cx(styles.text(), styles.secondary())}
								>
									{name}
								</label>
								{type === 'textarea' ? (
									<Textarea
										id={argId}
										rows={2}
										value={values[index] ?? ''}
										onChange={(event) =>
											setValue(selected, index, event.target.value)
										}
										placeholder={getPlaceholder(input)}
										spellCheck={false}
									/>
								) : (
									<Input.Group>
										<Input.Control
											id={argId}
											type={type}
											value={values[index] ?? ''}
											onValueChange={(value) =>
												setValue(selected, index, value)
											}
											placeholder={getPlaceholder(input)}
											spellCheck={false}
										/>
									</Input.Group>
								)}
							</div>
						)
					})}

					{data && data !== '0x' && (
						<div {...styles.encoded()}>
							<span {...cx(styles.encodedData(), truncate())}>{data}</span>
							<span {...cx(styles.shrink(), styles.secondary())}>
								{byteLength} bytes
							</span>
							<CopyButton
								ariaLabel="Copy calldata"
								value={data}
								className={styles.iconButton().className}
							/>
						</div>
					)}
				</div>
			) : (
				<>
					<textarea
						id={id}
						value={data}
						onChange={(event) => onChange(event.target.value)}
						onBlur={props.onBlur}
						placeholder="0x…"
						spellCheck={false}
						aria-invalid={props.invalid || undefined}
						{...cx(textField(), styles.hexTextarea())}
					/>
					{byteLength > 0 && (
						<span {...cx(styles.text(), styles.secondary())}>
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
					aria-expanded={false}
					onClick={() => setOpen(true)}
					{...cx(styles.optionalToggle(), pressDown(), transitionColors())}
				>
					<span {...styles.optionalIcon()}>{props.icon}</span>
					<span {...styles.shrink()}>{props.label}</span>
					{set && (
						<span {...cx(styles.optionalSummary(), truncate())}>
							{props.summary}
						</span>
					)}
					<span {...cx(styles.optionalIcon(), styles.pushRight())}>
						{set ? <ChevronDown /> : <Plus />}
					</span>
				</button>
				{set && props.onReset && (
					<Tooltip.Root>
						<Tooltip.Trigger
							render={
								<Button
									aria-label={`Reset ${props.label.toLowerCase()}`}
									onClick={props.onReset}
									shape="icon"
									size="small"
									variant="text"
									{...styles.iconButton()}
								/>
							}
						>
							<Delete />
						</Tooltip.Trigger>
						<Tooltip.Popup>{`Reset ${props.label.toLowerCase()}`}</Tooltip.Popup>
					</Tooltip.Root>
				)}
			</div>
		)

	return (
		<div {...styles.optionalOpen()}>
			<div {...styles.optional()}>
				<span {...styles.optionalIcon()}>{props.icon}</span>
				<span {...cx(styles.text(), styles.secondary())}>{props.label}</span>
				<Tooltip.Root>
					<Tooltip.Trigger
						render={
							<Button
								aria-label={`Collapse ${props.label.toLowerCase()}`}
								aria-expanded
								onClick={() => setOpen(false)}
								shape="icon"
								size="small"
								variant="text"
								{...cx(styles.iconButton(), styles.pushRight())}
							/>
						}
					>
						<Close />
					</Tooltip.Trigger>
					<Tooltip.Popup>{`Collapse ${props.label.toLowerCase()}`}</Tooltip.Popup>
				</Tooltip.Root>
			</div>
			{props.children}
		</div>
	)
}

namespace styles {
	export const text = style({ margin: '0', typography: 'copy.14' })

	export const secondary = style({ color: 'gray.900' })

	export const mono = style({ typography: 'label.12.mono' })

	export const shrink = style({ flexShrink: 0 })

	export const pushRight = style({ marginLeft: 'auto !custom' })

	// TDS Button owns size, fill, hover, and press; this adds only placement.
	export const iconButton = style({ flexShrink: 0 })

	export const calloutTitle = style({
		display: 'block',
		typography: 'copy.14.strong',
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
		gap: '4',
		minWidth: '0 !custom',
		overflowY: 'auto',
		padding: '4',
	})

	// A flex column stretches its items; the button keeps its own width.
	export const addCall = style({ alignSelf: 'flex-start' })

	export const context = style({
		borderBottomWidth: '1px',
		borderColor: 'grayAlpha.200',
		borderStyle: 'solid',
		display: 'flex',
		flexDirection: 'column',
		gap: '2',
		paddingBlock: '3',
		paddingInline: '4',
	})

	export const contextRow = style({
		alignItems: 'center',
		display: 'flex',
		gap: '2',
		justifyContent: 'space-between',
	})

	export const load = style({
		borderColor: 'grayAlpha.200',
		borderRadius: 'xl',
		borderStyle: 'solid',
		borderWidth: '1px',
		display: 'flex',
		flexDirection: 'column',
		gap: '2',
		padding: '3',
	})

	export const loadRow = style({
		alignItems: 'center',
		display: 'flex',
		gap: '2',
	})

	// Input.Group sizes to its content in a row; let it take the free width.
	export const loadInput = style({ flex: 1, minWidth: '0 !custom' })

	export const steps = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '2',
	})

	export const stepsCount = style({
		color: 'gray.900',
		marginLeft: '2',
	})

	export const stepList = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '2',
	})

	// Marks the call for the remove button's reveal.
	export const stepItem = style({ position: 'relative' })

	export const stepIndex = style({
		alignItems: 'center',
		backgroundColor: 'grayAlpha.200',
		borderRadius: 'full',
		color: 'gray.900',
		display: 'flex',
		flexShrink: 0,
		height: '4',
		justifyContent: 'center',
		typography: 'label.12',
		width: '4',
	})

	// Shown while the call is hovered or holds focus, so it is reachable by
	// keyboard: tabbing onto the call reveals it as the next stop.
	export const stepRemove = style({
		alignItems: 'center',
		backgroundColor: 'background.surface',
		borderColor: 'grayAlpha.200',
		borderRadius: 'full',
		borderStyle: 'solid',
		borderWidth: '1px',
		color: 'gray.900',
		cursor: 'pointer',
		display: 'none',
		height: '4',
		justifyContent: 'center',
		position: 'absolute',
		right: '-4px !custom',
		top: '-4px !custom',
		width: '4',
		'@media (hover: hover)': {
			':hover': { color: 'red.900' },
			selectors: { [`${stepItem}:hover &`]: { display: 'flex' } },
		},
		selectors: { [`${stepItem}:focus-within &`]: { display: 'flex' } },
	})

	export const stepRemoveIcon = style({
		height: '10px !custom',
		width: '10px !custom',
	})

	export const callFields = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
	})

	// Tag leaves its maximum width unset, so a long name truncates.
	export const nameBadge = style({ maxWidth: '100% !custom' })

	export const nameBadgeText = style({ minWidth: '0 !custom' })

	export const decoded = style({
		borderColor: 'grayAlpha.200',
		borderRadius: 'xl',
		borderStyle: 'solid',
		borderWidth: '1px',
		display: 'flex',
		flexDirection: 'column',
		gap: '3',
		padding: '3',
	})

	export const arg = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '2',
	})

	export const argType = style({
		color: 'gray.900',
		marginLeft: '2',
		typography: 'label.12.mono',
	})

	export const encoded = style({
		alignItems: 'center',
		borderColor: 'grayAlpha.200',
		borderStyle: 'solid',
		borderTopWidth: '1px',
		display: 'flex',
		gap: '2',
		paddingTop: '2',
		typography: 'copy.14',
	})

	export const encodedData = style({
		color: 'gray.900',
		flex: 1,
		minWidth: '0 !custom',
		typography: 'label.12.mono',
	})

	export const hexTextarea = style({
		height: 'auto !custom',
		minHeight: '80px !custom',
		paddingBlock: '3',
		resize: 'vertical',
		typography: 'label.12.mono',
		wordBreak: 'break-all',
	})

	export const optional = style({
		alignItems: 'center',
		display: 'flex',
		gap: '2',
	})

	export const optionalToggle = style({
		alignItems: 'center',
		color: 'gray.900',
		cursor: 'pointer',
		display: 'flex',
		flex: 1,
		gap: '2',
		minWidth: '0 !custom',
		textAlign: 'left',
		typography: 'copy.14',
		'@media (hover: hover)': { ':hover': { color: 'foreground' } },
	})

	export const optionalIcon = style({ display: 'flex', flexShrink: 0 })

	export const optionalSummary = style({
		color: 'foreground',
		fontVariantNumeric: 'tabular-nums',
		minWidth: '0 !custom',
		typography: 'copy.14',
	})

	export const optionalOpen = style({
		backgroundColor: 'background.surface',
		borderColor: 'grayAlpha.200',
		borderRadius: 'xl',
		borderStyle: 'solid',
		borderWidth: '1px',
		display: 'flex',
		flexDirection: 'column',
		gap: '2',
		padding: '3',
	})
}
