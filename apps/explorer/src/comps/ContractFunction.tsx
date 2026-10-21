import { useLocation } from '@tanstack/react-router'
import {
	Button,
	Checkbox,
	CopyButton,
	Field,
	Input,
	Rows,
	Textarea,
	Tooltip,
	style,
} from '@tempoxyz/ds'
import { getSignature } from 'ox/AbiItem'
import * as React from 'react'
import type { AbiFunction, AbiParameter } from 'viem'
import {
	getFunctionSelector,
	getInputType,
	getPlaceholder,
	isArrayType,
} from '#lib/domain/contracts'

/**
 * A function without arguments as a key-value `Rows.Row`: its signature, its
 * value or status, then its actions.
 */
export function FunctionRow(props: FunctionRow.Props): React.JSX.Element {
	const { actions, fn, id, tag, value } = props
	return (
		<Rows.Row id={id} spacing="none">
			<Rows.Label>
				<span {...styles.label()}>
					<span {...styles.signature()}>{getFunctionDisplaySignature(fn)}</span>
					{tag}
				</span>
			</Rows.Label>
			{value !== undefined && <span {...styles.value()}>{value}</span>}
			<span {...styles.actions()}>
				{actions}
				<FunctionCopyActions fn={fn} id={id} />
			</span>
		</Rows.Row>
	)
}

export declare namespace FunctionRow {
	type Props = {
		/** Buttons before the copy actions. */
		actions?: React.ReactNode
		fn: AbiFunction
		/** Element id, also the permalink fragment. */
		id: string
		/** Shown after the signature. */
		tag?: React.ReactNode
		/** The function's current value. */
		value?: React.ReactNode
	}
}

/**
 * A function with arguments as an expandable `Rows.Row`. Its panel holds the
 * function's form.
 */
export function FunctionDisclosure(
	props: FunctionDisclosure.Props,
): React.JSX.Element {
	const { children, expanded, fn, id, onToggle, tag } = props
	const panelId = React.useId()
	return (
		<>
			<Rows.Row
				action="expand"
				aria-controls={panelId}
				aria-expanded={expanded}
				id={id}
				onClick={onToggle}
				spacing="none"
			>
				<Rows.Info>
					<Rows.Title>
						<span {...styles.label()}>
							<span {...styles.signature()}>
								{fn.name || getFunctionSelector(fn)}
							</span>
							{tag}
						</span>
					</Rows.Title>
					<Rows.Description>
						<span {...styles.parameters()}>{getParameterList(fn)}</span>
					</Rows.Description>
				</Rows.Info>
			</Rows.Row>
			{expanded && <Rows.Panel id={panelId}>{children}</Rows.Panel>}
		</>
	)
}

export declare namespace FunctionDisclosure {
	type Props = {
		/** The function's form, shown while expanded. */
		children: React.ReactNode
		expanded: boolean
		fn: AbiFunction
		/** Element id, also the permalink fragment. */
		id: string
		onToggle: () => void
		/** Shown after the function name. */
		tag?: React.ReactNode
	}
}

/**
 * The form for one function's arguments, following the TDS Forms pattern:
 * fields in one column, then the actions aligned to the end with the primary
 * action last, then the result.
 */
export function FunctionForm(props: FunctionForm.Props): React.JSX.Element {
	const { children, fn, id, note, onSubmit, primary, result, secondary } = props
	return (
		<form
			noValidate
			onSubmit={(event) => {
				event.preventDefault()
				onSubmit()
			}}
			{...styles.form()}
		>
			{children}
			<div {...styles.footer()}>
				<span {...styles.utilities()}>
					<FunctionCopyActions fn={fn} id={id} />
					{note && <span {...styles.note()}>{note}</span>}
				</span>
				<span {...styles.formActions()}>
					{secondary}
					{primary}
				</span>
			</div>
			{result}
		</form>
	)
}

export declare namespace FunctionForm {
	type Props = {
		/** The argument fields. */
		children: React.ReactNode
		fn: AbiFunction
		id: string
		/** Short text beside the copy actions, such as why an action is missing. */
		note?: React.ReactNode
		onSubmit: () => void
		/** The submit button, named by its result. */
		primary?: React.ReactNode
		/** The outcome of the last call. */
		result?: React.ReactNode
		/** Actions before the primary action. */
		secondary?: React.ReactNode
	}
}

/** Copies the method name with its selector, and a link to the function. */
function FunctionCopyActions(props: {
	fn: AbiFunction
	id: string
}): React.JSX.Element {
	const { fn, id } = props
	const href = useLocation({ select: (location) => location.href })
	const permalink =
		typeof window === 'undefined'
			? `#${id}`
			: new URL(`#${id}`, new URL(href, window.location.origin)).href
	return (
		<>
			<CopyButton
				aria-label="Copy method name"
				value={getMethodWithSelector(fn)}
			/>
			<CopyButton aria-label="Copy link" value={permalink} />
		</>
	)
}

/** A small icon `Button` named by `label`, which its tooltip repeats. */
export function IconAction(props: IconAction.Props): React.JSX.Element {
	const { icon: Icon, label, ...rest } = props
	return (
		<Tooltip.Root>
			<Tooltip.Trigger
				render={
					<Button
						{...rest}
						aria-label={label}
						shape="icon"
						size="small"
						variant="text"
					/>
				}
			>
				<Icon {...styles.icon()} />
			</Tooltip.Trigger>
			<Tooltip.Popup>{label}</Tooltip.Popup>
		</Tooltip.Root>
	)
}

export declare namespace IconAction {
	type Props = Omit<
		Button.Props,
		'aria-label' | 'children' | 'className' | 'shape' | 'size' | 'variant'
	> & {
		icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactNode
		label: string
	}
}

/** The value a call returned, under a Result label and announced as it changes. */
export function FunctionResult(props: {
	children: React.ReactNode
}): React.JSX.Element {
	return (
		<div {...styles.result()}>
			<span {...styles.resultLabel()}>Result</span>
			<output aria-live="polite" {...styles.output()}>
				{props.children}
			</output>
		</div>
	)
}

/** Argument field for a function input, typed by its ABI parameter. */
export function FunctionInput(props: FunctionInput.Props): React.JSX.Element {
	const {
		input,
		invalid = false,
		label = input.name || 'value',
		onChange,
		value,
	} = props

	if (getInputType(input.type) === 'checkbox')
		return (
			<Field.Root>
				<Field.Item>
					<Checkbox
						checked={value === 'true'}
						onCheckedChange={(checked) => onChange(checked ? 'true' : 'false')}
					/>
					<Field.Label>{label}</Field.Label>
				</Field.Item>
				<Field.Description>{input.type}</Field.Description>
			</Field.Root>
		)

	const control = {
		autoCapitalize: 'off',
		autoComplete: 'off',
		autoCorrect: 'off',
		placeholder: getPlaceholder(input),
		required: true,
		spellCheck: false,
		value,
	} as const

	return (
		<Field.Root invalid={invalid}>
			<Field.Label>{label}</Field.Label>
			{getInputType(input.type) === 'textarea' || isArrayType(input.type) ? (
				<Textarea
					{...control}
					resize="none"
					onChange={(event) => onChange(event.target.value)}
				/>
			) : (
				<Input.Group>
					<Input.Control
						{...control}
						inputMode={/^uint\d*$/.test(input.type) ? 'numeric' : undefined}
						onValueChange={(next) => onChange(next)}
					/>
				</Input.Group>
			)}
			<Field.Description>{input.type}</Field.Description>
			<Field.Error match={invalid}>{getMissingValueError(input)}</Field.Error>
		</Field.Root>
	)
}

export declare namespace FunctionInput {
	type Props = {
		input: AbiParameter
		/** Marks an empty required value after a submit. */
		invalid?: boolean | undefined
		/** Defaults to the parameter name. */
		label?: string | undefined
		onChange: (value: string) => void
		value: string
	}
}

/** State key for an argument; unnamed (inferred ABI) arguments use their index. */
export function functionInputKey(input: AbiParameter, index: number): string {
	return input.name || `arg${index}`
}

/** Error for an empty argument, naming the value it needs. */
function getMissingValueError(input: AbiParameter): string {
	if (input.type === 'address') return 'Enter an address that starts with 0x.'
	if (/^u?int\d*$/.test(input.type)) return 'Enter a whole number.'
	if (isArrayType(input.type)) return 'Enter a JSON array, such as [1, 2].'
	return `Enter a ${input.type} value.`
}

/** Argument types and names, e.g. "address to, uint256 amount". */
function getParameterList(fn: AbiFunction): string {
	return fn.inputs
		.map((input) => (input.name ? `${input.type} ${input.name}` : input.type))
		.join(', ')
}

/** Display signature; unnamed (inferred ABI) functions show their selector. */
function getFunctionDisplaySignature(fn: AbiFunction): string {
	if (fn.name) return getSignature(fn).replace(/,/g, ', ')
	const selector = getFunctionSelector(fn)
	const inputs = fn.inputs?.map((i) => i.type).join(', ') ?? ''
	return `${selector}(${inputs})`
}

/** Method name with selector, e.g. "approve (0x095ea7b3)". */
function getMethodWithSelector(fn: AbiFunction): string {
	const selector = getFunctionSelector(fn)
	return `${fn.name || selector} (${selector})`
}

namespace styles {
	export const label = style({
		alignItems: 'center',
		columnGap: '8',
		display: 'inline-flex',
		flexWrap: 'wrap',
		rowGap: '4',
	})

	export const signature = style({
		color: 'foreground',
		typography: 'copy.13.mono',
	})

	export const parameters = style({
		overflowWrap: 'anywhere',
		typography: 'copy.13.mono',
	})

	// The value fills the space between the label and the actions.
	export const value = style({
		display: 'flex',
		flex: 1,
		justifyContent: 'flex-end',
		minWidth: '0',
		overflowWrap: 'anywhere',
		textAlign: 'end',
	})

	export const actions = style({
		alignItems: 'center',
		display: 'flex',
		flexShrink: 0,
	})

	export const form = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '16',
	})

	export const footer = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '12',
		justifyContent: 'space-between',
	})

	export const utilities = style({
		alignItems: 'center',
		display: 'flex',
		gap: '4',
	})

	export const note = style({
		color: 'gray.900',
		paddingInlineStart: '4',
		typography: 'copy.13',
	})

	export const formActions = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		marginInlineStart: 'auto !custom',
	})

	// Icons match the 16px glyph of TDS CopyButton beside them.
	export const icon = style({ fontSize: '16' })

	export const result = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
	})

	export const resultLabel = style({
		color: 'gray.900',
		typography: 'label.13',
	})

	export const output = style({
		backgroundColor: 'grayAlpha.100',
		borderRadius: '8',
		color: 'foreground',
		display: 'block',
		overflowWrap: 'anywhere',
		paddingBlock: '8',
		paddingInline: '12',
		typography: 'copy.13.mono',
		whiteSpace: 'pre-wrap',
	})
}
