export type ToWorker =
	| {
			type: 'start'
			workerId: number
			masterAddress: string
			seedHex: string
			startCounter: number
			stride: number
			batchSize: number
	  }
	| { type: 'stop' }

export type FromWorker =
	| { type: 'ready'; workerId: number }
	| {
			type: 'progress'
			workerId: number
			attempts: number
			hashesPerSecond: number
	  }
	| {
			type: 'found'
			workerId: number
			attempts: number
			saltHex: string
			masterIdHex: string
			hashHex: string
	  }
	| { type: 'stopped'; workerId: number; attempts: number }
	| { type: 'error'; workerId: number; message: string }
