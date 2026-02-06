export class MockQueryBuilder {
	private responses: unknown[] = []

	setResponses(responses: unknown[]): void {
		this.responses = [...responses]
	}

	reset(): void {
		this.responses = []
	}

	withSignatures(): this {
		return this
	}

	selectFrom(): this {
		return this
	}

	select(): this {
		return this
	}

	where(): this {
		return this
	}

	groupBy(): this {
		return this
	}

	orderBy(): this {
		return this
	}

	limit(): this {
		return this
	}

	offset(): this {
		return this
	}

	distinct(): this {
		return this
	}

	as(): this {
		return this
	}

	async execute(): Promise<unknown> {
		return this.nextResponse()
	}

	async executeTakeFirst(): Promise<unknown> {
		return this.nextResponse()
	}

	async executeTakeFirstOrThrow(): Promise<unknown> {
		const response = this.nextResponse()
		if (response == null) {
			throw new Error('Missing mock response')
		}
		return response
	}

	private nextResponse(): unknown {
		if (this.responses.length === 0) {
			throw new Error('No mock responses queued')
		}
		return this.responses.shift()
	}
}
