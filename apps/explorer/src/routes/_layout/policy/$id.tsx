import {
	createFileRoute,
	Link,
	notFound,
	stripSearchParams,
	useNavigate,
} from '@tanstack/react-router'
import { CopyButton, Field, Input, Tag, style } from '@tempoxyz/ds'
import { Search } from '@tempoxyz/ds/icons'
import * as React from 'react'
import { Addresses } from 'viem/tempo'
import * as z from 'zod/mini'
import { Address as AddressLink } from '#comps/Address'
import { BreadcrumbsSlot } from '#comps/Breadcrumbs'
import { DataGrid } from '#comps/DataGrid'
import { InfoCard } from '#comps/InfoCard'
import { Sections } from '#comps/Sections'
import { TimeColumnHeader, useTimeFormat } from '#comps/TimeFormat'
import { TimestampCell } from '#comps/TimestampCell'
import { TransactionCell } from '#comps/TransactionCell'
import { parseTip403PolicyId } from '#lib/domain/tip403'
import type {
	Tip403PolicyResponse,
	Tip403PolicyEvent,
} from '#lib/server/tip403'
import { fetchTip403Policy } from '#lib/server/tip403'
import { withLoaderTiming } from '#lib/profiling'
import { useMediaQuery } from '#lib/hooks'
import { link, linkHover, srOnly } from '#styles/explorer'
import { cx } from 'zyzz'

const defaultSearchValues = { page: 1, limit: 10, q: '' } as const

export const Route = createFileRoute('/_layout/policy/$id')({
	component: RouteComponent,
	notFoundComponent: ({ data }) => (
		<div {...styles.notFound()}>
			<div {...styles.notFoundContent()}>
				<h1 {...styles.notFoundTitle()}>Policy not found</h1>
				<p {...styles.notFoundMessage()}>
					The TIP-403 policy does not exist or could not be loaded.
				</p>
				{data ? <span {...srOnly()}>{String(data)}</span> : null}
			</div>
		</div>
	),
	validateSearch: z.object({
		page: z.prefault(z.coerce.number(), defaultSearchValues.page),
		limit: z.prefault(
			z.pipe(
				z.coerce.number(),
				z.transform((value) => Math.min(100, Math.max(5, value))),
			),
			defaultSearchValues.limit,
		),
		q: z.prefault(z.string(), defaultSearchValues.q),
	}),
	search: { middlewares: [stripSearchParams(defaultSearchValues)] },
	loaderDeps: ({ search: { page, limit, q } }) => ({ page, limit, q }),
	loader: ({ params, deps }) =>
		withLoaderTiming('/_layout/policy/$id', async () => {
			const policyId = parseTip403PolicyId(params.id)
			if (!policyId) throw notFound()
			const policy = await fetchTip403Policy({
				data: { policyId, page: deps.page, limit: deps.limit, query: deps.q },
			})
			if (!policy) throw notFound()
			return policy
		}),
	head: ({ params, loaderData }) => {
		const policyId = loaderData?.policyId ?? params.id
		const title = `TIP-403 Policy #${policyId} ⋅ Tempo Explorer`
		return {
			title,
			meta: [
				{ title },
				{
					name: 'description',
					content: `View TIP-403 transfer policy ${policyId} on Tempo.`,
				},
			],
		}
	},
})

function RouteComponent() {
	const policy = Route.useLoaderData()
	const { page, limit, q } = Route.useSearch()
	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'
	const [activeSection, setActiveSection] = React.useState(0)

	return (
		<div {...styles.page()}>
			<BreadcrumbsSlot className={styles.breadcrumbs().className} />
			<PolicyCard policy={policy} />
			<Sections
				mode={mode}
				activeSection={activeSection}
				onSectionChange={setActiveSection}
				sections={[
					{
						title: 'Members',
						contextual: <MembersSearch query={q} />,
						content: <MembersGrid policy={policy} page={page} limit={limit} />,
					},
					{
						title: 'Activity',
						content: <ActivityGrid policy={policy} />,
					},
				]}
			/>
		</div>
	)
}

function PolicyCard(props: { policy: Tip403PolicyResponse }) {
	const { policy } = props
	const builtIn =
		policy.policyId === '0'
			? 'Always reject'
			: policy.policyId === '1'
				? 'Always allow'
				: undefined

	return (
		<InfoCard
			title={<InfoCard.Title>TIP-403 policy</InfoCard.Title>}
			sections={[
				{ label: 'Policy ID', value: <span>#{policy.policyId}</span> },
				{
					label: 'Type',
					value: (
						<span {...styles.type()}>
							<PolicyTypeBadge type={policy.type} />
							{builtIn ? <span {...styles.builtIn()}>{builtIn}</span> : null}
						</span>
					),
				},
				{
					label: 'Admin',
					value: <AddressLink address={policy.admin} />,
				},
				{
					label: 'Registry',
					value: <AddressLink address={Addresses.tip403Registry} />,
				},
				...(policy.type === 'compound' && policy.componentPolicies
					? [
							{
								label: 'Sender policy',
								value: (
									<Link
										to="/policy/$id"
										params={{ id: policy.componentPolicies[0] }}
										{...cx(link(), linkHover())}
									>
										#{policy.componentPolicies[0]}
									</Link>
								),
							},
							{
								label: 'Recipient policy',
								value: (
									<Link
										to="/policy/$id"
										params={{ id: policy.componentPolicies[1] }}
										{...cx(link(), linkHover())}
									>
										#{policy.componentPolicies[1]}
									</Link>
								),
							},
							{
								label: 'Mint recipient',
								value: (
									<Link
										to="/policy/$id"
										params={{ id: policy.componentPolicies[2] }}
										{...cx(link(), linkHover())}
									>
										#{policy.componentPolicies[2]}
									</Link>
								),
							},
						]
					: []),
			]}
		/>
	)
}

function PolicyTypeBadge(props: { type: Tip403PolicyResponse['type'] }) {
	const intent =
		props.type === 'whitelist'
			? 'positive'
			: props.type === 'blacklist'
				? 'negative'
				: 'neutral'
	return (
		<Tag intent={intent} variant="plain">
			<Tag.Dot />
			{policyTypeLabels[props.type]}
		</Tag>
	)
}

const policyTypeLabels = {
	blacklist: 'Blacklist',
	compound: 'Compound',
	whitelist: 'Whitelist',
} satisfies Record<Tip403PolicyResponse['type'], string>

function MembersSearch(props: { query: string }) {
	const navigate = useNavigate()
	const search = (query: string) =>
		void navigate({
			to: '.',
			search: (previous) => ({
				...previous,
				page: 1,
				q: query || undefined,
			}),
		})
	return (
		<form
			onSubmit={(event) => {
				event.preventDefault()
				search(new FormData(event.currentTarget).get('query')?.toString() ?? '')
			}}
		>
			<Field.Root>
				<Input.Group>
					<Input.Prefix>
						<Search />
					</Input.Prefix>
					<Input.Control
						name="query"
						type="search"
						defaultValue={props.query}
						placeholder="Search addresses"
						aria-label="Search policy members"
						enterKeyHint="search"
						// Clearing the field also clears an applied filter.
						onValueChange={(value) => {
							if (!value && props.query) search('')
						}}
					/>
					<Input.Clear aria-label="Clear search" />
				</Input.Group>
			</Field.Root>
		</form>
	)
}

function MembersGrid(props: {
	policy: Tip403PolicyResponse
	page: number
	limit: number
}) {
	const { policy, page, limit } = props
	const pages = Math.max(1, Math.ceil(policy.membersTotal / limit))
	const status = policy.type === 'whitelist' ? 'Authorized' : 'Restricted'
	const statusIntent = policy.type === 'whitelist' ? 'positive' : 'negative'

	return (
		<DataGrid
			columns={{
				stacked: [
					{ label: 'Address', width: '1fr' },
					{ label: 'Status', width: '1fr' },
				],
				tabs: [
					{ label: 'Address', width: '1fr' },
					{ label: 'Status', width: '1fr' },
				],
			}}
			items={() =>
				policy.members.map((address) => ({
					key: address,
					cells: [
						<AddressLink key="address" address={address} />,
						<Tag key="status" intent={statusIntent} variant="plain">
							<Tag.Dot />
							{status}
						</Tag>,
					],
				}))
			}
			totalItems={policy.membersTotal}
			page={page}
			pages={pages}
			itemsPerPage={limit}
			itemsLabel="members"
			emptyState="This policy has no current members."
		/>
	)
}

function ActivityGrid(props: { policy: Tip403PolicyResponse }) {
	const { policy } = props
	const { formatLabel, cycleTimeFormat, timeFormat } = useTimeFormat()
	const timeColumn = (
		<TimeColumnHeader
			label="Time"
			formatLabel={formatLabel}
			onCycle={cycleTimeFormat}
		/>
	)

	return (
		<DataGrid
			columns={{
				stacked: [
					{ label: 'Event', width: '2fr' },
					{ label: 'Account', width: '2fr' },
					{ label: timeColumn, width: '1fr' },
					{ label: 'Transaction', width: '2fr' },
				],
				tabs: [
					{ label: 'Event', width: '2fr' },
					{ label: 'Account', width: '2fr' },
					{ label: timeColumn, width: '1fr' },
					{ label: 'Transaction', width: '2fr' },
				],
			}}
			items={() =>
				policy.activity.map((event) => activityRow(event, timeFormat))
			}
			totalItems={policy.activity.length}
			page={1}
			itemsPerPage={20}
			itemsLabel="events"
			pagination="simple"
			showSimpleCount={false}
			emptyState="No policy events found."
		/>
	)
}

function activityRow(
	event: Tip403PolicyEvent,
	timeFormat: ReturnType<typeof useTimeFormat>['timeFormat'],
): DataGrid.Row {
	const account = event.account ?? event.admin ?? event.updater
	const eventLabel =
		event.type === 'whitelist updated' || event.type === 'blacklist updated'
			? `${event.type === 'whitelist updated' ? 'Whitelist' : 'Blacklist'} ${event.allowed ? 'updated' : 'removed'}`
			: event.type === 'admin updated'
				? 'Admin updated'
				: event.type === 'compound created'
					? 'Compound policy created'
					: 'Policy created'

	return {
		key: `${event.txHash}-${event.logIndex}`,
		cells: [
			<span key="event" {...styles.event()}>
				{eventLabel}
			</span>,
			account ? (
				<AddressLink key="account" address={account} />
			) : (
				<span key="account">—</span>
			),
			event.timestamp != null ? (
				<TimestampCell
					key="time"
					timestamp={BigInt(event.timestamp)}
					format={timeFormat}
				/>
			) : (
				<span key="time">—</span>
			),
			<div key="transaction" {...styles.transaction()}>
				<TransactionCell hash={event.txHash} />
				<CopyButton aria-label="Copy transaction hash" value={event.txHash} />
			</div>,
		],
	}
}

namespace styles {
	export const notFound = style({
		alignItems: 'center',
		display: 'flex',
		flex: 1,
		justifyContent: 'center',
		paddingInline: '16',
		paddingTop: '64',
	})

	export const notFoundContent = style({ textAlign: 'center' })

	export const notFoundTitle = style({
		color: 'foreground',
		typography: 'heading.32.subtle',
	})

	export const notFoundMessage = style({
		color: 'gray.900',
		marginTop: '8',
		typography: 'copy.14',
	})

	// Stacked until the members table has room beside the policy card; the
	// card's column is capped so long values truncate instead of widening it.
	export const page = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '16',
		minWidth: '0 !custom',
		paddingBottom: '32',
		paddingInline: '16',
		paddingTop: '40',
		width: '100% !custom',
		'@media (width >= 800px)': { paddingBottom: '64', paddingTop: '64' },
		'@media (width >= 1024px)': {
			alignItems: 'start',
			display: 'grid',
			gridTemplateColumns: 'minmax(0, 360px) minmax(0, 1fr)',
		},
		'@media (width >= 1240px)': { maxWidth: '1280px !custom' },
	})

	export const breadcrumbs = style({ gridColumn: '1 / -1' })

	export const type = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
	})

	export const builtIn = style({ color: 'gray.900' })

	export const event = style({ color: 'foreground' })

	export const transaction = style({
		alignItems: 'center',
		display: 'flex',
		gap: '4',
	})
}
