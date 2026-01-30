import {
	tempoDevnet,
	tempoLocalnet,
	tempoModerato,
	tempoAndantino,
} from 'wagmi/chains'
import { createConfig, fallback, http, webSocket } from 'wagmi'

import { tempoPresto } from '#chains.ts'

export const wagmiConfig = createConfig({
	chains: [
		tempoDevnet,
		tempoPresto,
		tempoLocalnet,
		tempoModerato,
		tempoAndantino,
	],
	transports: {
		[tempoLocalnet.id]: fallback([
			http(tempoLocalnet.rpcUrls.default.http.at(0)),
		]),
		[tempoModerato.id]: fallback([
			http(tempoModerato.rpcUrls.default.http.at(0)),
			webSocket(tempoModerato.rpcUrls.default.webSocket.at(0)),
		]),
		[tempoAndantino.id]: fallback([
			http(tempoAndantino.rpcUrls.default.http.at(0)),
			webSocket(tempoAndantino.rpcUrls.default.webSocket.at(0)),
		]),
		[tempoDevnet.id]: fallback([
			http(tempoDevnet.rpcUrls.default.http.at(0)),
			webSocket(tempoDevnet.rpcUrls.default.webSocket.at(0)),
		]),
		[tempoPresto.id]: fallback([
			http(tempoPresto.rpcUrls.default.http.at(0)),
			webSocket(tempoPresto.rpcUrls.default.webSocket.at(0)),
		]),
	},
})

declare module 'wagmi' {
	interface Register {
		config: typeof wagmiConfig
	}
}
