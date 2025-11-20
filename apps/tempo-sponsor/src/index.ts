import { createClient, http, walletActions, type Client, type WalletActions, type Account } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { RpcRequest, RpcResponse } from 'ox'
import { tempo } from 'tempo.ts/chains'
import { Transaction } from 'tempo.ts/viem'

export interface Env {
  SPONSOR_PRIVATE_KEY: string
  TEMPO_RPC_URL?: string
  ALLOWED_ORIGINS?: string
}

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

function getCorsHeaders(origin: string | null, env: Env): HeadersInit {
  const allowedOrigins = env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || ['*']
  
  if (allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin))) {
    return {
      ...CORS_HEADERS,
      'Access-Control-Allow-Origin': origin || '*',
    }
  }
  
  return CORS_HEADERS
}

function createSponsorClient(env: Env): Client & WalletActions {
  const rpcUrl = 'https://rpc.testnet.tempo.xyz'
  const sponsorAccount = privateKeyToAccount(env.SPONSOR_PRIVATE_KEY as `0x${string}`)
  
  return createClient({
    account: sponsorAccount,
    chain: tempo({ feeToken: '0x20c0000000000000000000000000000000000001' }),
        transport: http(rpcUrl, {
            fetchOptions: {
                headers :{
                    Authorization: `Basic ${btoa("eng:zealous-mayer")}`,

                }
            }

        }),
  }).extend(walletActions)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    const corsHeaders = getCorsHeaders(origin, env)
    
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      })
    }
    
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { 
        status: 405,
        headers: corsHeaders,
      })
    }
    
    try {
      const client = createSponsorClient(env)
      
      const requestData = await request.json() as any
      const rpcRequest = RpcRequest.from(requestData)
      
      if (!rpcRequest.method || !rpcRequest.method.includes('eth_sendRawTransaction')) {
        return new Response(
          JSON.stringify(RpcResponse.from(
            { error: { code: -32601, message: 'Method not supported' } },
            { request: rpcRequest }
          )),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        )
      }
      
      if (!rpcRequest.params || !Array.isArray(rpcRequest.params)) {
        return new Response(
          JSON.stringify(RpcResponse.from(
            { error: { code: -32602, message: 'Invalid params' } },
            { request: rpcRequest }
          )),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        )
      }
      
      const serialized = rpcRequest.params[0] as `0x76${string}`
      
      const transaction = Transaction.deserialize(serialized)
      
      const serializedTransaction = await client.signTransaction({
        ...transaction,
        feePayer: client.account,
      } as any)
      
      const result = await client.request({
        method: 'eth_sendRawTransaction',
        params: [serializedTransaction],
      })
      
      const sender = 'from' in transaction ? transaction.from : 'unknown'
      console.log(`Sponsored transaction for ${sender}`)
      
      return new Response(
        JSON.stringify(RpcResponse.from({ result }, { request: rpcRequest })),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      )
    } catch (error) {
      console.error('Worker error:', error)
      
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : 'Internal server error',
          },
          id: null,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      )
    }
  },
}
