import * as React from 'react'
import { type Address, type Hash, isAddress, isHash } from 'viem'
import { cx } from '#cva.config'
import ArrowRight from '~icons/lucide/arrow-right'

export function ExploreInput(props: ExploreInput.Props) {
	const {
		onActivate,
		onAddress,
		onHash,
		onBlock,
		autoFocus,
		value,
		onChange,
		size = 'medium',
		disabled,
	} = props
	const formRef = React.useRef<HTMLFormElement>(null)
	const isLarge = size === 'large'

	const inputRef = React.useRef<HTMLInputElement>(null)

	React.useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
				event.preventDefault()
				inputRef.current?.focus()
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [])

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
				if (isAddress(formValue)) {
					onActivate?.({ type: 'address', value: formValue })
					return
				}
				if (isHash(formValue)) {
					onActivate?.({ type: 'hash', value: formValue })
					return
				}
				if (Number.isSafeInteger(Number(formValue))) {
					onActivate?.({ type: 'block', value: formValue })
					return
				}
				onActivate?.({ type: 'text', value: formValue })
			}}
			className="relative w-full max-w-[448px]"
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
					isLarge ? 'h-[52px] text-[17px]' : 'h-[42px] text-[15px]',
				)}
				data-1p-ignore
				name="value"
				placeholder="Enter an address, token or transaction…"
				spellCheck={false}
				type="text"
				onChange={(event) => {
					const val = event.target.value
					onChange?.(val)
					const val_ = val.trim()
					if (isHash(val_)) {
						onHash?.(val_)
						return
					}
					if (isAddress(val_)) {
						onAddress?.(val_)
						return
					}
					if (Number.isSafeInteger(Number(val_))) {
						onBlock?.(val_)
						return
					}
				}}
			/>
			<div
				className={cx(
					'absolute top-[50%] -translate-y-[50%]',
					isLarge ? 'right-[16px]' : 'right-[12px]',
				)}
			>
				<button
					type="submit"
					disabled={disabled}
					className={cx(
						'rounded-full! bg-accent text-base-plane flex items-center justify-center cursor-pointer active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-50',
						isLarge ? 'size-[28px]' : 'size-[24px]',
					)}
				>
					<ArrowRight className={isLarge ? 'size-[16px]' : 'size-[14px]'} />
				</button>
			</div>
		</form>
	)
}

export namespace ExploreInput {
	export type ValueType = 'address' | 'hash' | 'block' | 'text'

	export interface Props {
		onActivate?: (
			data:
				| { value: Address; type: 'address' }
				| { value: Hash; type: 'hash' }
				| { value: string; type: 'block' }
				| { value: string; type: 'text' },
		) => void
		onAddress?: (address: Address) => void
		onHash?: (hash: Hash) => void
		onBlock?: (block: string) => void
		autoFocus?: boolean
		value: string
		onChange: (value: string) => void
		size?: 'large' | 'medium'
		disabled?: boolean
	}
}
