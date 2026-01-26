import 'dotenv/config'
import { createPublicClient, http, defineChain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const tempoModerato = defineChain({
  id: 42431,
  name: 'Tempo Moderato Testnet',
  network: 'tempo-moderato',
  nativeCurrency: { name: 'Tempo', symbol: 'TEMPO', decimals: 18 },
  rpcUrls: { default: { http: [process.env.TEMPO_RPC || 'https://rpc.moderato.tempo.xyz'] } },
  blockExplorers: { default: { name: 'Tempo Explorer', url: 'https://explore.moderato.tempo.xyz' } },
})

const pk = process.env.PRIVATE_KEY
if (!pk) throw new Error('PRIVATE_KEY missing in .env')
const account = privateKeyToAccount(pk)

const client = createPublicClient({
  chain: tempoModerato,
  transport: http(process.env.TEMPO_RPC || 'https://rpc.moderato.tempo.xyz'),
})

const res = await client.request({
  method: 'tempo_fundAddress',
  params: [account.address],
})

console.log(`Fund requested for ${account.address}`)
console.log(res)
