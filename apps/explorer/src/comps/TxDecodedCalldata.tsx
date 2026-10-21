import { Button, CopyButton, style } from '@tempoxyz/ds'
import type { AbiFunction } from 'abitype'
import { useMemo, useState } from 'react'
import { decodeAbiParameters, parseAbiItem, slice } from 'viem'
import type { Abi, Address, Hex } from 'viem'
import { AbiArgument } from '#comps/AbiArgument'
import { getAbiItem, getContractInfo } from '#lib/domain/contracts'
import { useAutoloadAbi, useLookupSignature } from '#lib/queries'
import { codeIdentifier, mono } from '#styles/explorer'

export function TxDecodedCalldata(
	props: TxDecodedCalldata.Props,
): React.JSX.Element {
	const { address, data } = props
	const selector = slice(data, 0, 4)
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

	const signatureText = `${abiItem.name}(${abiItem.inputs?.map((input) => `${input.type}${input.name ? ` ${input.name}` : ''}`).join(', ') ?? ''})`

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
					<CopyButton
						aria-label="Copy signature"
						value={signatureText}
						{...styles.copy()}
					/>
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
				size="small"
				variant="secondary"
				{...styles.toggle()}
			>
				{showRaw ? 'Hide raw data' : 'Show raw data'}
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

		return (
			<div {...styles.raw()}>
				<pre {...styles.rawData()}>{data}</pre>
				<CopyButton
					aria-label="Copy input data"
					value={data}
					{...styles.copy()}
				/>
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

	// A well on the section surface that holds the decoded call.
	export const panel = style({
		backgroundColor: 'background.primary',
		borderRadius: '8',
		minWidth: '0 !custom',
	})

	export const raw = style({
		alignItems: 'flex-start',
		display: 'flex',
		gap: '8',
		paddingBlock: '8',
		paddingInline: '12',
	})

	export const rawData = style({
		color: 'foreground',
		flex: '1 !custom',
		margin: '0',
		maxHeight: '300px !custom',
		minWidth: '0 !custom',
		overflow: 'auto',
		typography: 'label.12.mono',
		whiteSpace: 'pre-wrap',
		wordBreak: 'break-all',
	})

	// Negative margins let the 32px copy button sit in a 16px text row without
	// growing it.
	export const copy = style({
		flexShrink: '0 !custom',
		marginBlock: '-8px !custom',
		marginRight: '-8px !custom',
	})

	export const header = style({
		alignItems: 'center',
		borderBottomWidth: '1px',
		borderColor: 'grayAlpha.200',
		display: 'flex',
		gap: '8',
		justifyContent: 'space-between',
		paddingBlock: '8',
		paddingInline: '12',
	})

	export const signature = style({
		color: 'foreground',
		typography: 'label.12.mono',
		wordBreak: 'break-all',
	})

	export const secondary = style({ color: 'gray.900' })

	export const primary = style({ color: 'foreground' })

	export const argumentList = style({
		selectors: {
			'& > :not(:last-child)': {
				borderBottomWidth: '1px',
				borderColor: 'grayAlpha.200',
			},
		},
	})

	// Button leaves its alignment in a column unset.
	export const toggle = style({ alignSelf: 'flex-start' })
}
