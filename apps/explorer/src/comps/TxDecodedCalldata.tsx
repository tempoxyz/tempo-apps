import { Button, IconButton, Tooltip, style } from '@tempoxyz/ds/platform'
import { Check, Copy } from '@tempoxyz/ds/platform/icons'
import type { AbiFunction } from 'abitype'
import { useMemo, useState } from 'react'
import { decodeAbiParameters, parseAbiItem, slice } from 'viem'
import type { Abi, Address, Hex } from 'viem'
import { AbiArgument } from '#comps/AbiArgument'
import { getAbiItem, getContractInfo } from '#lib/domain/contracts'
import { useCopy } from '#lib/hooks'
import { useAutoloadAbi, useLookupSignature } from '#lib/queries'
import { codeIdentifier, mono } from '#styles/explorer'

export function TxDecodedCalldata(props: TxDecodedCalldata.Props) {
	const { address, data } = props
	const selector = slice(data, 0, 4)
	const copySignature = useCopy()
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
				<TxDecodedCalldata.RawData data={data} />
			</div>
		)

	return (
		<div {...styles.root()}>
			<div {...styles.panel()}>
				<div {...styles.header()}>
					<code {...styles.signature()}>
						<span {...codeIdentifier()}>
							{'name' in abiItem ? (
								abiItem.name
							) : (
								<span {...mono()}>{selector}</span>
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
					<Tooltip content="Copy signature">
						<IconButton
							{...styles.copyButton()}
							aria-label="Copy signature"
							onClick={() =>
								copySignature.copy(
									`${abiItem.name}(${abiItem.inputs?.map((input) => `${input.type}${input.name ? ` ${input.name}` : ''}`).join(', ') ?? ''})`,
								)
							}
							scale="small"
							variant="tertiary"
						>
							{copySignature.notifying ? <Check /> : <Copy />}
						</IconButton>
					</Tooltip>
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
			<Button
				aria-expanded={showRaw}
				onClick={() => setShowRaw(!showRaw)}
				scale="small"
				variant="secondary"
				{...styles.toggle()}
			>
				{showRaw ? 'Hide' : 'Show'} raw
			</Button>
			{showRaw && (
				<div {...styles.panel()}>
					<TxDecodedCalldata.RawData data={data} />
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

	export function RawData(props: RawData.Props): React.JSX.Element {
		const { data } = props
		const { copy, notifying } = useCopy()

		return (
			<div {...styles.raw()}>
				<pre {...styles.rawData()}>{data}</pre>
				<div {...styles.rawActions()}>
					<Tooltip content="Copy raw data">
						<IconButton
							{...styles.copyButton()}
							aria-label="Copy raw data"
							onClick={() => copy(data)}
							scale="small"
							variant="tertiary"
						>
							{notifying ? <Check /> : <Copy />}
						</IconButton>
					</Tooltip>
				</div>
			</div>
		)
	}

	export namespace RawData {
		export interface Props {
			data: Hex
		}
	}
}

namespace styles {
	export const root = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
	})

	// An opaque well, so the copy control can mask the text it overlaps. It
	// clips, so focus rings inside it are drawn inset (the element type beats
	// IconButton's own offset).
	export const panel = style({
		backgroundColor: 'background.primary',
		borderRadius: '2xs',
		overflow: 'hidden',
		selectors: {
			'& a:focus-visible': { outlineOffset: '-2px' },
			'& button:focus-visible': { outlineOffset: '-2px' },
			'& summary:focus-visible': { outlineOffset: '-2px' },
		},
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

	export const rawActions = style({
		backgroundColor: 'background.primary',
		display: 'flex',
		paddingLeft: '8',
		position: 'absolute',
		right: '12',
		top: '8',
	})

	// Negative margins let the 32px IconButton sit in a 16px text row without
	// growing it. Only properties IconButton leaves unset.
	export const copyButton = style({
		flexShrink: '0 !custom',
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
		gap: '8',
		justifyContent: 'space-between',
		paddingBlock: '8',
		paddingInline: '12',
	})

	export const signature = style({
		color: 'content.primary',
		typography: 'body.b3',
	})

	export const secondary = style({ color: 'content.secondary' })

	export const primary = style({ color: 'content.primary' })

	export const argumentList = style({
		selectors: {
			'& > :not(:last-child)': {
				borderBottomWidth: 'regular',
				borderColor: 'line.secondary',
			},
		},
	})

	// Button leaves its alignment in a column unset.
	export const toggle = style({ alignSelf: 'flex-start' })
}
