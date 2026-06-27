import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import {
	isTip20ChannelOpen,
	reserveChannelOpenSponsorship,
	TIP20_CHANNEL_OPEN_SELECTOR,
	TIP20_CHANNEL_RESERVE_ADDRESS,
} from '../src/lib/channel-open-limit.js'

describe('channel open sponsorship limit', () => {
	it('detects TIP20 channel reserve open calls', () => {
		expect(
			isTip20ChannelOpen({
				calls: [
					{
						to: TIP20_CHANNEL_RESERVE_ADDRESS,
						input: `${TIP20_CHANNEL_OPEN_SELECTOR}${'00'.repeat(32)}`,
					},
				],
			}),
		).toBe(true)

		expect(
			isTip20ChannelOpen({
				calls: [
					{
						to: TIP20_CHANNEL_RESERVE_ADDRESS,
						input: `0xdc48471e${'00'.repeat(32)}`,
					},
				],
			}),
		).toBe(false)

		expect(
			isTip20ChannelOpen({
				calls: [
					{
						to: '0x20c000000000000000000000b9537d11c60e8b50',
						input: TIP20_CHANNEL_OPEN_SELECTOR,
					},
				],
			}),
		).toBe(false)
	})

	it('limits sponsored channel opens per address per UTC day', async () => {
		const from = `0x${'1'.repeat(40)}`

		for (let i = 0; i < 5; i++) {
			await expect(reserveChannelOpenSponsorship(from)).resolves.toMatchObject({
				allowed: true,
				count: i + 1,
				limit: 5,
			})
		}

		await expect(reserveChannelOpenSponsorship(from)).resolves.toMatchObject({
			allowed: false,
			count: 5,
			limit: 5,
		})

		const today = new Date().toISOString().slice(0, 10)
		expect(
			await env.SponsorApiKeyStore.get(
				`channel-open:${from.toLowerCase()}:${today}`,
			),
		).toBe('5')
	})
})
