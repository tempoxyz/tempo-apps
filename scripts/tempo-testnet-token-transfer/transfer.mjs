import 'dotenv/config'
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  parseUnits,
  formatUnits,
} from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'

const tempoModerato = defineChain({
  id: 42431,
  name: 'Tempo Moderato Testnet',
  network: 'tempo-moderato',
  nativeCurrency: { name: 'Tempo', symbol: 'TEMPO', decimals: 18 },
  rpcUrls: { default: { http: [process.env.TEMPO_RPC || 'https://rpc.moderato.tempo.xyz'] } },
  blockExplorers: { default: { name: 'Tempo Explorer', url: 'https://explore.moderato.tempo.xyz' } },
})

const TOKENS = {
  pathUSD:  '0x20c0000000000000000000000000000000000000',
  AlphaUSD: '0x20c0000000000000000000000000000000000001',
  BetaUSD:  '0x20c0000000000000000000000000000000000002',
  ThetaUSD: '0x20c0000000000000000000000000000000000003',
}

const TIP20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'a', type: 'address' }],
    outputs: [{ name: 'b', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'ok', type: 'bool' }],
  },
]

const pk = process.env.PRIVATE_KEY
if (!pk) throw new Error('PRIVATE_KEY missing in .env')

const tokenKey = process.env.TOKEN || 'AlphaUSD'
const amountHuman = process.env.AMOUNT || '1'
const rpc = process.env.TEMPO_RPC || 'https://rpc.moderato.tempo.xyz'

const account = privateKeyToAccount(pk)
const to = process.env.TO_ADDRESS || privateKeyToAccount(generatePrivateKey()).address

const token = TOKENS[tokenKey]
if (!token) throw new Error(`Unknown TOKEN=${tokenKey}`)

const publicClient = createPublicClient({ chain: tempoModerato, transport: http(rpc) })
const walletClient = createWalletClient({ chain: tempoModerato, transport: http(rpc), account })

const DECIMALS = 6

async function balance(addr) {
  const raw = await publicClient.readContract({
    address: token,
    abi: TIP20_ABI,
    functionName: 'balanceOf',
    args: [addr],
  })
  return { raw, formatted: formatUnits(raw, DECIMALS) }
}

async function main() {
  const beforeFrom = await balance(account.address)
  const beforeTo = await balance(to)

  const amount = parseUnits(amountHuman, DECIMALS)

  const hash = await walletClient.writeContract({
    address: token,
    abi: TIP20_ABI,
    functionName: 'transfer',
    args: [to, amount],
  })

  console.log(`From:   ${account.address}`)
  console.log(`To:     ${to}`)
  console.log(`Token:  ${tokenKey} @ ${token}`)
  console.log(`Amount: ${amountHuman}`)
  console.log(`Tx:     ${hash}`)
  console.log(`Explorer: ${tempoModerato.blockExplorers.default.url}/tx/${hash}`)

  await publicClient.waitForTransactionReceipt({ hash })

  const afterFrom = await balance(account.address)
  const afterTo = await balance(to)

  console.log(`\nBalances (${tokenKey})`)
  console.log(`From: ${beforeFrom.formatted} -> ${afterFrom.formatted}`)
  console.log(`To:   ${beforeTo.formatted} -> ${afterTo.formatted}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
