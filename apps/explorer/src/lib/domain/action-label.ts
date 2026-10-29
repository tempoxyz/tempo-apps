import type { KnownEvent, KnownEventPart } from '#lib/domain/known-events'

/**
 * Explorer surfaces show what a transaction already did, so action labels
 * read in the past tense (Sent, Swapped, Deposited to Earn), the same tense
 * Tempo Cash and Wallet use. Domain code keeps the canonical verb ("Send")
 * that its rules match on; only presentation goes through here.
 */
const VERBS: Record<string, string> = {
	Activate: 'Activated',
	Add: 'Added',
	Allow: 'Allowed',
	Approve: 'Approved',
	Authorize: 'Authorized',
	Block: 'Blocked',
	Bounce: 'Bounced',
	Burn: 'Burned',
	Call: 'Called',
	Cancel: 'Cancelled',
	Change: 'Changed',
	Claim: 'Claimed',
	Close: 'Closed',
	Create: 'Created',
	Deactivate: 'Deactivated',
	Delegate: 'Delegated',
	Deploy: 'Deployed',
	Deposit: 'Deposited',
	Disallow: 'Disallowed',
	Distribute: 'Distributed',
	Enable: 'Enabled',
	Expire: 'Expired',
	Forward: 'Forwarded',
	Get: 'Read',
	Grant: 'Granted',
	Increment: 'Incremented',
	Migrate: 'Migrated',
	Mint: 'Minted',
	Open: 'Opened',
	Pause: 'Paused',
	Pay: 'Paid',
	Publish: 'Published',
	Remove: 'Removed',
	Request: 'Requested',
	Resume: 'Resumed',
	Revoke: 'Revoked',
	Schedule: 'Scheduled',
	Send: 'Sent',
	Set: 'Set',
	Settle: 'Settled',
	Sponsor: 'Sponsored',
	Start: 'Started',
	Submit: 'Submitted',
	Swap: 'Swapped',
	Transfer: 'Transferred',
	Unblock: 'Unblocked',
	Update: 'Updated',
	Withdraw: 'Withdrew',
}

/** Whole labels whose past tense isn't just their first verb conjugated. */
const LABELS: Record<string, string> = {
	'Admin Burn': 'Burned by Admin',
	'Complete Fill': 'Filled',
	'Partial Fill': 'Partially Filled',
	'Private Zone Deposit': 'Deposited to Private Zone',
	'Private Zone Withdrawal': 'Withdrew from Private Zone',
	'Rebalance Swap': 'Swapped (Rebalance)',
	'Self Transfer': 'Transferred to Self',
	// "Blocked" describes what happened to the send, not a send that went through.
	'Send Blocked': 'Send Blocked',
	'Top Up': 'Topped Up',
}

/** Earn withdrawal status badges that change what the action claims. */
const EARN_WITHDRAWAL_STATUS: Record<string, string> = {
	Requested: 'Requested Earn Withdrawal',
	Cancelled: 'Cancelled Earn Withdrawal',
	Completed: 'Withdrew from Earn',
}

const FAILED_SUFFIX = ' (failed)'

export function pastTenseAction(value: string): string {
	// A reverted call didn't happen: keep its verb and say it failed.
	if (value.endsWith(FAILED_SUFFIX))
		return `${value.slice(0, -FAILED_SUFFIX.length)} Failed`
	const label = LABELS[value]
	if (label) return label
	const encrypted = /^Encrypted Deposit to (.+)$/.exec(value)
	if (encrypted) return `Deposited to ${encrypted[1]} (Encrypted)`
	const order = /^(Limit|Flip) (Buy|Sell)$/.exec(value)
	if (order) return `Placed ${order[1]} ${order[2]}`
	const [verb, ...rest] = value.split(' ')
	const past = verb ? VERBS[verb] : undefined
	return past ? [past, ...rest].join(' ') : value
}

export function toPastTenseEvent(event: KnownEvent): KnownEvent {
	const actions = event.parts.filter((part) => part.type === 'action')
	if (actions.length === 0) return event

	const neutral = toNeutralTransfer(event)
	if (neutral) return neutral

	if (event.type === 'order flipped') {
		const side = /^Flip (Buy|Sell)$/.exec(actions[0]?.value ?? '')?.[1]
		if (side)
			return replaceActions(event, (value, index) =>
				index === 0 ? `Flipped to ${side}` : pastTenseAction(value),
			)
	}

	const [first, second] = actions
	const status = second ? EARN_WITHDRAWAL_STATUS[second.value] : undefined
	if (first?.value === 'Withdraw from Earn' && second && status) {
		let seen = 0
		return {
			...event,
			parts: event.parts.flatMap((part): KnownEventPart[] => {
				if (part.type !== 'action') return [part]
				seen += 1
				if (seen === 1) return [{ ...part, value: status }]
				if (seen === 2) return []
				return [{ ...part, value: pastTenseAction(part.value) }]
			}),
		}
	}

	return replaceActions(event, pastTenseAction)
}

/**
 * A receipt is read by the sender, the receiver and anyone else, so a token
 * movement names both sides ("Transferred 10 USDC from Alice to Bob") instead
 * of the sender's "Sent". A proven payment (the sender called `transfer`
 * directly) keeps that signal as a Payment tag.
 */
function toNeutralTransfer(event: KnownEvent): KnownEvent | null {
	if (event.type !== 'send' && event.type !== 'transfer') return null
	const action = event.parts.find((part) => part.type === 'action')?.value
	if (action !== 'Send' && action !== 'Transfer') return null
	const tags: KnownEventPart[] = [{ type: 'action', value: 'Transferred' }]
	if (action === 'Send') tags.push({ type: 'action', value: 'Payment' })
	const { from, to } = event.meta ?? {}
	if (!from || !to)
		return {
			...event,
			parts: [...tags, ...event.parts.filter((part) => part.type !== 'action')],
		}
	return {
		...event,
		parts: [
			...tags,
			...event.parts.filter((part) => part.type === 'amount'),
			{ type: 'text', value: 'from' },
			{ type: 'account', value: from },
			{ type: 'text', value: 'to' },
			{ type: 'account', value: to },
		],
	}
}

function replaceActions(
	event: KnownEvent,
	format: (value: string, index: number) => string,
): KnownEvent {
	let index = 0
	return {
		...event,
		parts: event.parts.map((part) =>
			part.type === 'action'
				? { ...part, value: format(part.value, index++) }
				: part,
		),
	}
}
