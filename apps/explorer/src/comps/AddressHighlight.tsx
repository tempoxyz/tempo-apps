import type { Address } from 'ox'
import * as React from 'react'
import { isAddressEqual } from 'viem'
import { useRoutePrefetch } from '#lib/hooks'

interface AddressHighlightContextValue {
	highlightedAddress: Address.Address | null
	setHighlightedAddress: (address: Address.Address | null) => void
}

const AddressHighlightContext =
	React.createContext<AddressHighlightContextValue | null>(null)

export function AddressHighlightProvider(props: { children: React.ReactNode }) {
	const [highlightedAddress, setHighlightedAddress] =
		React.useState<Address.Address | null>(null)

	const value = React.useMemo(
		() => ({ highlightedAddress, setHighlightedAddress }),
		[highlightedAddress],
	)

	return (
		<AddressHighlightContext.Provider value={value}>
			{props.children}
		</AddressHighlightContext.Provider>
	)
}

export function useAddressHighlight(address: Address.Address) {
	const context = React.useContext(AddressHighlightContext)
	if (!context) {
		throw new Error(
			'useAddressHighlight must be used within AddressHighlightProvider',
		)
	}

	const { highlightedAddress, setHighlightedAddress } = context
	const isHighlighted =
		highlightedAddress !== null && isAddressEqual(highlightedAddress, address)

	const { prefetch, cancel } = useRoutePrefetch({
		to: '/address/$address',
		params: { address },
	})

	const handlers = React.useMemo(
		() => ({
			onMouseEnter: () => {
				setHighlightedAddress(address)
				prefetch()
			},
			onMouseLeave: () => {
				setHighlightedAddress(null)
				cancel()
			},
			onFocus: () => {
				setHighlightedAddress(address)
				prefetch()
			},
			onBlur: () => {
				setHighlightedAddress(null)
				cancel()
			},
		}),
		[address, setHighlightedAddress, prefetch, cancel],
	)

	return { isHighlighted, handlers }
}
