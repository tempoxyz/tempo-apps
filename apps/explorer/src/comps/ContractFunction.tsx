import {
	Checkbox,
	IconButton,
	TextInput,
	Tooltip,
	style,
	variants,
} from '@tempoxyz/ds/platform'
import {
	Check,
	ChevronDown,
	Copy,
	Link as LinkIcon,
} from '@tempoxyz/ds/platform/icons'
import { getSignature } from 'ox/AbiItem'
import type * as React from 'react'
import type { AbiFunction, AbiParameter } from 'viem'
import { cx } from 'zyzz'
import {
	getFunctionSelector,
	getInputType,
	getPlaceholder,
	isArrayType,
} from '#lib/domain/contracts'
import { useCopy, useCopyPermalink } from '#lib/hooks'
import { pressDown, transitionColors } from '#styles/explorer'

/** Card for one read or write function: signature, copy actions, and body. */
export function FunctionCard(props: FunctionCard.Props): React.JSX.Element {
	const { actions, children, expanded = false, fn, id, onToggle, tag } = props
	const { copy, notifying } = useCopy({ timeout: 2_000 })
	const { linkNotifying, handleCopyPermalink } = useCopyPermalink({
		fragment: id,
	})

	const signature = (
		<>
			<span {...styles.signature()}>{getFunctionDisplaySignature(fn)}</span>
			{tag}
		</>
	)

	return (
		<div id={id} {...styles.card()}>
			<div {...styles.header()}>
				{onToggle ? (
					<button
						type="button"
						aria-expanded={expanded}
						onClick={onToggle}
						{...cx(styles.title(), styles.toggle(), pressDown())}
					>
						{signature}
					</button>
				) : (
					<div {...styles.title()}>{signature}</div>
				)}
				<div {...styles.actions()}>
					<FunctionAction
						label="Copy method name"
						onClick={() => void copy(getMethodWithSelector(fn))}
					>
						{notifying ? <Check /> : <Copy />}
					</FunctionAction>
					<FunctionAction
						label="Copy permalink"
						onClick={() => void handleCopyPermalink()}
					>
						{linkNotifying ? <Check /> : <LinkIcon />}
					</FunctionAction>
					{actions}
					{onToggle && (
						<FunctionAction
							label={expanded ? 'Collapse function' : 'Expand function'}
							aria-expanded={expanded}
							onClick={onToggle}
						>
							<ChevronDown {...styles.chevron({ expanded })} />
						</FunctionAction>
					)}
				</div>
			</div>
			{children && <div {...styles.body()}>{children}</div>}
		</div>
	)
}

export declare namespace FunctionCard {
	type Props = {
		/** Extra header actions, placed after the copy actions. */
		actions?: React.ReactNode
		children?: React.ReactNode
		expanded?: boolean | undefined
		fn: AbiFunction
		/** Element id, also the permalink fragment. */
		id: string
		/** Makes the signature a disclosure button for the body. */
		onToggle?: (() => void) | undefined
		/** Shown after the signature. */
		tag?: React.ReactNode
	}
}

/** Small tertiary icon action in a function card header. */
export function FunctionAction(props: FunctionAction.Props): React.JSX.Element {
	const { children, label, ...rest } = props
	return (
		<Tooltip content={label}>
			<IconButton
				{...rest}
				aria-label={label}
				scale="small"
				variant="tertiary"
				{...cx(styles.action(), pressDown(), transitionColors())}
			>
				{children}
			</IconButton>
		</Tooltip>
	)
}

export declare namespace FunctionAction {
	type Props = Omit<
		IconButton.Props,
		'aria-label' | 'className' | 'scale' | 'variant'
	> & { label: string }
}

/** Argument field for a function input, typed by its ABI parameter. */
export function FunctionInput(props: FunctionInput.Props): React.JSX.Element {
	const { input, label = input.name || 'value', onChange, value } = props

	if (getInputType(input.type) === 'checkbox')
		return (
			<Checkbox
				checked={value === 'true'}
				onCheckedChange={(checked) => onChange(checked ? 'true' : 'false')}
				label={
					<span {...styles.checkboxLabel()}>
						{label} <span {...styles.inputType()}>{input.type}</span>
					</span>
				}
			/>
		)

	const field = {
		autoCapitalize: 'off',
		autoComplete: 'off',
		autoCorrect: 'off',
		className: styles.control().className,
		label,
		placeholder: getPlaceholder(input),
		secondaryLabel: input.type,
		spellCheck: false,
		value,
	} as const

	return (
		<div {...styles.field()}>
			{getInputType(input.type) === 'textarea' || isArrayType(input.type) ? (
				<TextInput
					{...field}
					extended
					onChange={(event) => onChange(event.target.value)}
				/>
			) : (
				<TextInput
					{...field}
					onChange={(event) => onChange(event.target.value)}
				/>
			)}
		</div>
	)
}

export declare namespace FunctionInput {
	type Props = {
		input: AbiParameter
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
	export const card = style({
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderRadius: 'xs',
		borderWidth: 'regular',
		overflow: 'hidden',
	})

	export const header = style({
		alignItems: 'center',
		display: 'flex',
		justifyContent: 'space-between',
	})

	export const title = style({
		alignItems: 'center',
		display: 'flex',
		flex: 1,
		flexWrap: 'wrap',
		gap: '8',
		minWidth: '0px !custom',
		paddingBlock: '8',
		paddingLeft: '12',
		textAlign: 'left',
	})

	// The card clips overflow, so the ring is drawn inside, following the
	// card's corners.
	export const toggle = style({
		cursor: 'pointer',
		':focus-visible': {
			borderBottomLeftRadius: 'xs',
			borderTopLeftRadius: 'xs',
			outlineOffset: '-2px',
		},
	})

	export const signature = style({
		color: 'content.secondary',
		minWidth: '0px !custom',
		overflowWrap: 'anywhere',
		typography: 'mono.inline',
	})

	export const actions = style({
		alignItems: 'center',
		display: 'flex',
		flexShrink: 0,
		paddingLeft: '12',
		paddingRight: '4',
	})

	// The card clips overflow, so the ring is drawn inside the button. It
	// needs importance to beat IconButton's own equal-specificity offset.
	export const action = style({
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.regular' },
		},
		':focus-visible': { outlineOffset: '-2px !important' },
		':disabled': { opacity: 0.5 },
	})

	export const chevron = variants({
		defaultVariants: { expanded: false },
		variants: {
			expanded: { true: { rotate: '180deg' }, false: {} },
		},
	})

	export const body = style({
		borderColor: 'line.secondary',
		borderTopWidth: 'regular',
		display: 'flex',
		flexDirection: 'column',
		gap: '16',
		padding: '12',
	})

	// TextInput caps itself at 320px; arguments such as addresses need the
	// full card. Touch devices keep 16px text so iOS does not zoom on focus.
	export const field = style({
		selectors: { '& > div': { width: '100% !custom' } },
		'@media (pointer: coarse)': {
			selectors: {
				'& input': { fontSize: '16px !custom' },
				'& textarea': { fontSize: '16px !custom' },
			},
		},
	})

	export const control = style({
		'::placeholder': { color: 'content.secondary' },
	})

	export const checkboxLabel = style({ color: 'content.primary' })

	export const inputType = style({ color: 'content.secondary' })
}
