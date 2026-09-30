import { createFileRoute } from '@tanstack/react-router'
import { getChainId } from 'wagmi/actions'
import { addressLiveResponse } from '#lib/server/address-live'
import { getWagmiConfig } from '#wagmi.config'

export const Route = createFileRoute('/api/address/live/$address')({
	server: {
		handlers: {
			GET: ({ request, params }) =>
				addressLiveResponse(
					request,
					params.address,
					getChainId(getWagmiConfig()),
				),
		},
	},
})
