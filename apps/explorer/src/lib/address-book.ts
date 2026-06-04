import { useQuery } from '@tanstack/react-query'
import type { Address } from 'ox'
import { useConnection } from 'wagmi'

export type AddressBookProfile = {
	address: Address.Address
	tag: `$${string}`
}

export type AddressBookContact = AddressBookProfile & {
	id: string
	createdAt: string
	updatedAt: string
}

export type AddressBook = {
	profile: AddressBookProfile | null
	contacts: AddressBookContact[]
}

type RequestProvider = {
	request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>
}

export function useWalletAddressBook() {
	const { address, connector } = useConnection()

	return useQuery({
		queryKey: ['wallet-address-book', connector?.id, address],
		enabled: Boolean(address && connector),
		staleTime: 30_000,
		retry: false,
		queryFn: async () => {
			if (!connector) throw new Error('Wallet connector not found')
			const provider = (await connector.getProvider()) as RequestProvider
			return provider.request({
				method: 'wallet_getAddressBook',
				params: [],
			}) as Promise<AddressBook>
		},
	})
}

export function useAddressBookLabel(address: Address.Address | undefined) {
	const addressBook = useWalletAddressBook()
	const normalized = address?.toLowerCase()

	if (!normalized || !addressBook.data) return undefined
	if (addressBook.data.profile?.address.toLowerCase() === normalized)
		return addressBook.data.profile.tag

	return addressBook.data.contacts.find(
		(contact) => contact.address.toLowerCase() === normalized,
	)?.tag
}
