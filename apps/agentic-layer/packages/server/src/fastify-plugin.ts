import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { handle402Request, prepareGateConfig, type GateConfig } from './generic'

/**
 * Configuration for the Fastify 402 gate.
 */
export interface FastifyGateConfig extends GateConfig { }

/**
 * Fastify plugin to enforce 402 Payment Required.
 */
const fastify402: FastifyPluginAsync<FastifyGateConfig> = async (
    fastify: any,
    config: FastifyGateConfig,
) => {
    const preparedConfig = prepareGateConfig(config)

    fastify.addHook(
        'preHandler',
        async (request: FastifyRequest, reply: FastifyReply) => {
            const auth = request.headers.authorization
            const result = await handle402Request(auth, preparedConfig)

            if (result.authorized) {
                ; (request as any).payment = { txHash: result.txHash }
                return
            }

            if (result.headers) {
                reply.headers(result.headers)
            }

            reply.status(result.status).send(result.body)
        },
    )
}

export default fp(fastify402, {
    name: '@tempo/402-server-fastify',
    fastify: '4.x',
})
