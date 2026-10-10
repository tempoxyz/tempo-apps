import { IconButton, style } from '@tempoxyz/ds/platform'
import type { AbiFunction } from 'abitype'
import { useMemo, useState } from 'react'
import { decodeAbiParameters, parseAbiItem, slice } from 'viem'
import type { Abi, Address, Hex } from 'viem'
import { cx } from 'zyzz'
import { AbiArgument } from '#comps/AbiArgument'
import { getAbiItem, getContractInfo } from '#lib/domain/contracts'
import { useCopy } from '#lib/hooks'
import { useAutoloadAbi, useLookupSignature } from '#lib/queries'
import { pressDown, transitionColors } from '#styles/explorer'
import CopyIcon from '~icons/lucide/copy'

export function TxDecodedCalldata(props: TxDecodedCalldata.Props) {
	const { address, data } = props
	const selector = slice(data, 0, 4)
	const copySignature = useCopy()
	const copyRaw = useCopy()
	const [showRaw, setShowRaw] = useState(false)

	const { data: autoloadAbi } = useAutoloadAbi({
		address,
		enabled: Boolean(data) && data !== '0x',
	})

	const { data: signature, isFetched } = useLookupSignature({
		selector,
	})

	const signatureAbi = useMemo(() => {
		if (!signature) return
		return [parseAbiItem(`function ${signature}`) as AbiFunction] as const
	}, [signature])

	const abiItem = useMemo(() => {
		const autoloadAbiItem =
			autoloadAbi &&
			(getAbiItem({
				abi: autoloadAbi as unknown as Abi,
				selector,
			}) as AbiFunction)

		const signatureAbiItem =
			signatureAbi &&
			(getAbiItem({
				abi: signatureAbi,
				selector,
			}) as AbiFunction)
		const contractAbi = address ? getContractInfo(address)?.abi : undefined
		const contractAbiItem =
			contractAbi &&
			(getAbiItem({
				abi: contractAbi,
				selector,
			}) as AbiFunction)

		return [autoloadAbiItem, contractAbiItem, signatureAbiItem]
			.filter((item): item is AbiFunction => Boolean(item))
			.sort((a, b) => (b.inputs?.length ?? 0) - (a.inputs?.length ?? 0))[0]
	}, [address, autoloadAbi, signatureAbi, selector])

	const rawArgs = abiItem && data.length > 10 ? slice(data, 4) : undefined
	const { args } = useMemo(() => {
		if (abiItem && rawArgs && 'name' in abiItem && 'inputs' in abiItem) {
			try {
				return {
					args: decodeAbiParameters(abiItem.inputs, rawArgs),
				}
			} catch {
				// Leave arguments undecoded when the selected ABI does not match the calldata.
			}
		}
		return { args: undefined }
	}, [abiItem, rawArgs])

	if (!isFetched || !abiItem)
		return (
			<div {...styles.panel()}>
				<div {...styles.raw()}>
					<pre {...styles.rawData()}>{data}</pre>
					<div {...cx(styles.actions(), styles.rawActions())}>
						{copyRaw.notifying && <span {...styles.copied()}>copied</span>}
						<IconButton
							{...cx(styles.copyButton(), pressDown(), transitionColors())}
							aria-label="Copy raw data"
							onClick={() => copyRaw.copy(data)}
							scale="small"
							title="Copy raw data"
							variant="tertiary"
						>
							<CopyIcon />
						</IconButton>
					</div>
				</div>
			</div>
		)

	return (
		<div {...styles.root()}>
			<div {...styles.panel()}>
				<div {...styles.header()}>
					<code {...styles.signature()}>
						<span {...styles.positive()}>
							{'name' in abiItem ? (
								abiItem.name
							) : (
								<span {...styles.mono()}>{selector}</span>
							)}
						</span>
						<span {...styles.secondary()}>(</span>
						{abiItem.inputs?.map((input, i) => (
							<span key={`${input.type}-${input.name ?? i}`}>
								{i > 0 && <span {...styles.secondary()}>, </span>}
								<span {...styles.secondary()}>{input.type}</span>
								{input.name && <span {...styles.primary()}> {input.name}</span>}
							</span>
						))}
						<span {...styles.secondary()}>)</span>
					</code>
					<div {...styles.actions()}>
						{copySignature.notifying && (
							<span {...styles.copied()}>copied</span>
						)}
						<IconButton
							{...cx(styles.copyButton(), pressDown(), transitionColors())}
							aria-label="Copy signature"
							scale="small"
							variant="tertiary"
							onClick={() =>
								copySignature.copy(
									`${abiItem.name}(${abiItem.inputs?.map((input) => `${input.type}${input.name ? ` ${input.name}` : ''}`).join(', ') ?? ''})`,
								)
							}
							title="Copy signature"
						>
							<CopyIcon />
						</IconButton>
					</div>
				</div>
				{args && args.length > 0 && (
					<div {...styles.argumentList()}>
						{abiItem.inputs?.map((input, i) => (
							<AbiArgument
								key={`${input.type}-${input.name ?? i}`}
								input={input}
								value={args[i]}
							/>
						))}
					</div>
				)}
			</div>
			<button
				type="button"
				onClick={() => setShowRaw(!showRaw)}
				{...cx(styles.toggle(), pressDown(), transitionColors())}
			>
				{showRaw ? 'Hide' : 'Show'} raw
			</button>
			{showRaw && (
				<div {...styles.panel()}>
					<div {...styles.raw()}>
						<pre {...styles.rawData()}>{data}</pre>
						<div {...cx(styles.actions(), styles.rawActions())}>
							{copyRaw.notifying && <span {...styles.copied()}>copied</span>}
							<IconButton
								{...cx(styles.copyButton(), pressDown(), transitionColors())}
								aria-label="Copy raw data"
								onClick={() => copyRaw.copy(data)}
								scale="small"
								title="Copy raw data"
								variant="tertiary"
							>
								<CopyIcon />
							</IconButton>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

export namespace TxDecodedCalldata {
	export interface Props {
		address?: Address | null
		data: Hex
	}
}

namespace styles {
	export const root = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
	})

	// An opaque well, so the copy control can mask the text it overlaps.
	export const panel = style({
		backgroundColor: 'background.primary',
		borderRadius: '2xs',
		overflow: 'hidden',
	})

	export const raw = style({
		paddingBlock: '8',
		paddingInline: '12',
		position: 'relative',
	})

	export const rawData = style({
		color: 'content.primary',
		maxHeight: '300px !custom',
		overflow: 'auto',
		paddingRight: '40',
		typography: 'mono.inline',
		whiteSpace: 'pre-wrap',
		wordBreak: 'break-all',
	})

	export const actions = style({
		alignItems: 'center',
		color: 'content.tertiary',
		display: 'flex',
		gap: '4',
	})

	export const rawActions = style({
		backgroundColor: 'background.primary',
		paddingLeft: '8',
		position: 'absolute',
		right: '12',
		top: '8',
	})

	export const copied = style({ typography: 'body.b3', userSelect: 'none' })

	// IconButton keeps its 32px target; negative margins keep the row height
	// of the old 22px control. Only properties IconButton leaves unset.
	export const copyButton = style({
		marginBlock: '-8px !custom',
		marginRight: '-8px !custom',
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.regular' },
		},
	})

	export const header = style({
		alignItems: 'center',
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		display: 'flex',
		justifyContent: 'space-between',
		paddingBlock: '8',
		paddingInline: '12',
	})

	export const signature = style({
		color: 'content.primary',
		typography: 'body.b3',
	})

	export const positive = style({ color: 'content.positive' })

	export const secondary = style({ color: 'content.secondary' })

	export const primary = style({ color: 'content.primary' })

	export const mono = style({ fontFamily: '"JetBrains Mono", monospace' })

	export const argumentList = style({
		selectors: {
			'& > :not(:last-child)': {
				borderBottomWidth: 'regular',
				borderColor: 'line.secondary',
			},
		},
	})

	export const toggle = style({
		backgroundColor: 'container.regular',
		borderRadius: 'full',
		color: 'content.primary',
		cursor: 'pointer',
		paddingBlock: '4',
		paddingInline: '12',
		typography: 'body.b3',
		width: 'fit-content !custom',
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.strong' },
		},
	})
}
