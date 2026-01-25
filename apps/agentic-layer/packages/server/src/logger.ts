import pino from 'pino'

export const logger = pino({
	level: process.env.LOG_LEVEL || 'info',
	transport: {
		target: 'pino-pretty', // Nice for dev, can be removed for prod
		options: {
			colorize: true,
		},
	},
	serializers: {
		req: pino.stdSerializers.req,
		res: pino.stdSerializers.res,
		err: pino.stdSerializers.err,
	},
})
