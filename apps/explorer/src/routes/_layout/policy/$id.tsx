import {
	createFileRoute,
	Link,
	notFound,
	stripSearchParams,
	useNavigate,
} from '@tanstack/react-router'
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
import { cx } from '#lib/css'
import { parseTip403PolicyId } from '#lib/domain/tip403'
import type {
	Tip403PolicyResponse,
	Tip403PolicyEvent,
} from '#lib/server/tip403'
import { fetchTip403Policy } from '#lib/server/tip403'
import { withLoaderTiming } from '#lib/profiling'
import { useMediaQuery } from '#lib/hooks'

const defaultSearchValues = { page: 1, limit: 10, q: '' } as const

export const Route = createFileRoute('/_layout/policy/$id')({
	component: RouteComponent,
	notFoundComponent: ({ data }) => (
		<div className="flex flex-1 items-center justify-center px-4 pt-20">
			<div className="text-center">
				<h1 className="text-[32px] font-medium text-primary">
					Policy Not Found
				</h1>
				<p className="mt-2 text-[15px] text-secondary">
					The TIP-403 policy does not exist or could not be loaded.
				</p>
				{data ? <span className="sr-only">{String(data)}</span> : null}
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
		<div className="max-[800px]:flex max-[800px]:flex-col max-[800px]:pt-10 max-[800px]:pb-8 grid w-full grid-cols-[auto_1fr] gap-[14px] px-4 pt-20 pb-16 min-w-0 min-[1240px]:max-w-[1280px]">
			<BreadcrumbsSlot className="col-span-full" />
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
			className="self-start max-[800px]:w-full"
			sections={[
				{ label: 'Policy ID', value: <span>#{policy.policyId}</span> },
				{
					label: 'Type',
					value: (
						<span className="flex items-center gap-2">
							<PolicyTypeBadge type={policy.type} />
							{builtIn ? (
								<span className="text-tertiary">{builtIn}</span>
							) : null}
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
										className="text-accent hover:underline"
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
										className="text-accent hover:underline"
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
										className="text-accent hover:underline"
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
	return (
		<span
			className={cx(
				'rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium capitalize',
				props.type === 'whitelist'
					? 'bg-positive/10 text-positive'
					: props.type === 'blacklist'
						? 'bg-negative/10 text-negative'
						: 'bg-accent/10 text-accent',
			)}
		>
			{props.type}
		</span>
	)
}

function MembersSearch(props: { query: string }) {
	const navigate = useNavigate()
	return (
		<form
			className="flex items-center gap-2"
			onSubmit={(event) => {
				event.preventDefault()
				const query =
					new FormData(event.currentTarget).get('query')?.toString() ?? ''
				void navigate({
					to: '.',
					search: (previous) => ({
						...previous,
						page: 1,
						q: query || undefined,
					}),
				})
			}}
		>
			<input
				name="query"
				defaultValue={props.query}
				placeholder="Search addresses"
				aria-label="Search policy members"
				className="h-7 w-[220px] rounded-[4px] border border-base-border bg-base px-2 text-[12px] font-mono text-primary outline-none placeholder:text-tertiary focus:border-accent"
			/>
			<button
				type="submit"
				className="h-7 rounded-[4px] border border-base-border px-2 text-[12px] text-secondary hover:bg-base-alt press-down"
			>
				Search
			</button>
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
						<span
							key="status"
							className={
								policy.type === 'whitelist' ? 'text-positive' : 'text-negative'
							}
						>
							{status}
						</span>,
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
			<span key="event" className="text-primary">
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
			<div key="transaction" className="flex items-center gap-1">
				<TransactionCell hash={event.txHash} />
				<CopyButton value={event.txHash} ariaLabel="Copy transaction hash" />
			</div>,
		],
	}
}
