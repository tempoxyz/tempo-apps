import { describe, expect, test } from 'vitest'
import { tempo, tempoDevnet, tempoModerato } from '@wagmi/core/chains'

import { getRpcAuthorizationHeader } from '#lib/rpc.ts'

const env = {
	TEMPO_MAINNET_RPC_AUTH: 'mainnet-client:mainnet-key',
	TEMPO_TESTNET_RPC_AUTH: 'testnet-client:testnet-key',
}

describe('getRpcAuthorizationHeader', () => {
	test('uses the mainnet credentials for Tempo mainnet', () => {
		expect(getRpcAuthorizationHeader(tempo.id, env)).toBe(
			`Basic ${btoa(env.TEMPO_MAINNET_RPC_AUTH)}`,
		)
	})

	test('uses the testnet credentials for Tempo Moderato', () => {
		expect(getRpcAuthorizationHeader(tempoModerato.id, env)).toBe(
			`Basic ${btoa(env.TEMPO_TESTNET_RPC_AUTH)}`,
		)
	})

	test('does not authenticate other chains', () => {
		expect(getRpcAuthorizationHeader(tempoDevnet.id, env)).toBeUndefined()
	})

	test('does not authenticate when the credential is missing', () => {
		expect(getRpcAuthorizationHeader(tempo.id, {})).toBeUndefined()
	})
})
