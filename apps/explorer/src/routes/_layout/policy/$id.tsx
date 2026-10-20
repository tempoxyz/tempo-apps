import {
	createFileRoute,
	Link,
	notFound,
	stripSearchParams,
	useNavigate,
} from '@tanstack/react-router'
import { Field, Input, Tag, style } from '@tempoxyz/ds'
import { Search } from '@tempoxyz/ds/icons'
import * as React from 'react'
import { Addresses } from 'viem/tempo'
import * as z from 'zod/mini'
import { Address as AddressLink } from '#comps/Address'
import { BreadcrumbsSlot } from '#comps/Breadcrumbs'
import { CopyButton } from '#comps/CopyButton'
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
				<h1 {...styles.notFoundTitle()}>Policy Not Found</h1>
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
						totalItems: policy.membersTotal,
						autoCollapse: false,
						contextual: <MembersSearch query={q} />,
						content: <MembersGrid policy={policy} page={page} limit={limit} />,
					},
					{
						title: 'Activity',
						totalItems: policy.activity.length,
						autoCollapse: false,
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
			title={<InfoCard.Title>TIP-403 Policy</InfoCard.Title>}
			className={styles.card().className}
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
					value: <AddressLink address={policy.admin} chars={4} />,
				},
				{
					label: 'Registry',
					value: <AddressLink address={Addresses.tip403Registry} chars={4} />,
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
		<Tag intent={intent} variant="plain" {...styles.typeLabel()}>
			<Tag.Dot />
			{props.type}
		</Tag>
	)
}

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
			{...styles.search()}
			onSubmit={(event) => {
				event.preventDefault()
				search(new FormData(event.currentTarget).get('query')?.toString() ?? '')
			}}
		>
			<Field.Root>
				<Input.Group variant="search">
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
					{ label: 'Address', width: '1fr', minWidth: 220 },
					{ label: 'Status', width: '1fr', minWidth: 110 },
				],
				tabs: [
					{ label: 'Address', width: '1fr', minWidth: 220 },
					{ label: 'Status', width: '1fr', minWidth: 110 },
				],
			}}
			items={() =>
				policy.members.map((address) => ({
					key: address,
					cells: [
						<AddressLink key="address" address={address} chars={5} />,
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
					{ label: 'Event', width: '2fr', minWidth: 150 },
					{ label: 'Account', width: '2fr', minWidth: 200 },
					{ label: timeColumn, width: '1fr', minWidth: 90 },
					{ label: 'Transaction', width: '2fr', minWidth: 150 },
				],
				tabs: [
					{ label: 'Event', width: '2fr', minWidth: 150 },
					{ label: 'Account', width: '2fr', minWidth: 200 },
					{ label: timeColumn, width: '1fr', minWidth: 90 },
					{ label: 'Transaction', width: '2fr', minWidth: 150 },
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
				<AddressLink key="account" address={account} chars={4} />
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
				<CopyButton value={event.txHash} ariaLabel="Copy transaction hash" />
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
		paddingInline: '4',
		paddingTop: '16',
	})

	export const notFoundContent = style({ textAlign: 'center' })

	export const notFoundTitle = style({
		color: 'foreground',
		typography: 'heading.32.subtle',
	})

	export const notFoundMessage = style({
		color: 'gray.900',
		marginTop: '2',
		typography: 'copy.14',
	})

	export const page = style({
		display: 'grid',
		gap: '4',
		gridTemplateColumns: 'auto 1fr',
		minWidth: '0px !custom',
		paddingBottom: '16',
		paddingInline: '4',
		paddingTop: '16',
		width: '100% !custom',
		'@media (width < 800px)': {
			display: 'flex',
			flexDirection: 'column',
			paddingBottom: '8',
			paddingTop: '10',
		},
		'@media (width >= 1240px)': { maxWidth: '1280px !custom' },
	})

	export const breadcrumbs = style({ gridColumn: '1 / -1' })

	export const card = style({
		alignSelf: 'start',
		'@media (width < 800px)': { width: '100% !custom' },
	})

	export const type = style({
		alignItems: 'center',
		display: 'flex',
		gap: '2',
	})

	export const typeLabel = style({ textTransform: 'capitalize' })

	export const builtIn = style({ color: 'gray.900' })

	// Touch devices keep 16px text so iOS does not zoom on focus.
	export const search = style({
		'@media (pointer: coarse)': {
			selectors: { '& input': { fontSize: '16px !custom' } },
		},
	})

	export const event = style({ color: 'foreground' })

	export const transaction = style({
		alignItems: 'center',
		display: 'flex',
		gap: '1',
	})
}
