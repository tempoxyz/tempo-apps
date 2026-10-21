import {
	Button,
	Checkbox,
	Field,
	Input,
	Textarea,
	Tooltip,
	style,
	variants,
} from '@tempoxyz/ds'
import { Check, ChevronDown, Copy, Link as LinkIcon } from '@tempoxyz/ds/icons'
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
import { pressDown } from '#styles/explorer'

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

/** Small text icon button with a tooltip in a function card header. */
export function FunctionAction(props: FunctionAction.Props): React.JSX.Element {
	const { children, label, ...rest } = props
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
						{...styles.action()}
					/>
				}
			>
				{children}
			</Tooltip.Trigger>
			<Tooltip.Popup>{label}</Tooltip.Popup>
		</Tooltip.Root>
	)
}

export declare namespace FunctionAction {
	type Props = Omit<
		Button.Props,
		'aria-label' | 'children' | 'className' | 'shape' | 'size' | 'variant'
	> & { children: React.ReactElement; label: string }
}

/** Argument field for a function input, typed by its ABI parameter. */
export function FunctionInput(props: FunctionInput.Props): React.JSX.Element {
	const { input, label = input.name || 'value', onChange, value } = props

	if (getInputType(input.type) === 'checkbox')
		return (
			<Field.Root>
				<Field.Item>
					<Checkbox
						checked={value === 'true'}
						onCheckedChange={(checked) => onChange(checked ? 'true' : 'false')}
					/>
					<Field.Label>
						{label} <span {...styles.inputType()}>{input.type}</span>
					</Field.Label>
				</Field.Item>
			</Field.Root>
		)

	const control = {
		autoCapitalize: 'off',
		autoComplete: 'off',
		autoCorrect: 'off',
		placeholder: getPlaceholder(input),
		spellCheck: false,
		value,
	} as const

	return (
		<Field.Root {...styles.field()}>
			<div {...styles.labels()}>
				<Field.Label>{label}</Field.Label>
				<span {...styles.inputType()}>{input.type}</span>
			</div>
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
						onValueChange={(next) => onChange(next)}
					/>
				</Input.Group>
			)}
		</Field.Root>
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
	// A bordered, unpadded card; TDS Surface always pads its content.
	export const card = style({
		backgroundColor: 'background.surface',
		borderColor: 'grayAlpha.200',
		borderRadius: '12',
		borderStyle: 'solid',
		borderWidth: '1px',
		boxSizing: 'border-box',
		color: 'foreground',
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
		minWidth: '0',
		paddingBlock: '8',
		paddingLeft: '12',
		textAlign: 'left',
	})

	// The card clips overflow, so the ring is drawn inside, following the
	// card's corners.
	export const toggle = style({
		cursor: 'pointer',
		':focus-visible': {
			borderBottomLeftRadius: '12',
			borderTopLeftRadius: '12',
			outlineOffset: '-2px',
		},
	})

	export const signature = style({
		color: 'gray.900',
		minWidth: '0',
		overflowWrap: 'anywhere',
		typography: 'label.12.mono',
	})

	// The card clips overflow, so the row leaves room on the right and above
	// and below for the TDS Buttons' focus rings (2px outside each button).
	export const actions = style({
		alignItems: 'center',
		display: 'flex',
		flexShrink: 0,
		paddingBlock: '4',
		paddingLeft: '12',
		paddingRight: '4',
	})

	// TDS Button leaves icon size to the icon.
	export const action = style({
		selectors: { '& svg': { height: '16', width: '16' } },
	})

	export const chevron = variants({
		defaultVariants: { expanded: false },
		variants: {
			expanded: { true: { rotate: '180deg' }, false: {} },
		},
	})

	export const body = style({
		borderColor: 'grayAlpha.200',
		borderTopWidth: '1px',
		display: 'flex',
		flexDirection: 'column',
		gap: '16',
		padding: '12',
	})

	// Touch devices keep 16px text so iOS does not zoom on focus.
	export const field = style({
		'@media (pointer: coarse)': {
			selectors: {
				'& input': { fontSize: '16px !custom' },
				'& textarea': { fontSize: '16px !custom' },
			},
		},
	})

	export const labels = style({
		alignItems: 'center',
		columnGap: '4',
		display: 'flex',
		flexWrap: 'wrap',
		typography: 'label.14',
	})

	export const inputType = style({ color: 'gray.900' })
}
