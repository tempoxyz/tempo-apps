import { Link, useRouterState } from '@tanstack/react-router'
import { Breadcrumbs as TdsBreadcrumbs, formatHex } from '@tempoxyz/ds'
import type * as React from 'react'

/** Where the current page sits: Home, its section when it has one, then the page. */
export function BreadcrumbsSlot(
	props: BreadcrumbsSlot.Props,
): React.JSX.Element | null {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	})
	const trail = getTrail(pathname)
	if (!trail) return null

	return (
		<TdsBreadcrumbs className={props.className}>
			<TdsBreadcrumbs.Item render={<Link to="/" />}>Home</TdsBreadcrumbs.Item>
			{trail.section && (
				<TdsBreadcrumbs.Item render={<Link to={trail.section.to} />}>
					{trail.section.label}
				</TdsBreadcrumbs.Item>
			)}
			<TdsBreadcrumbs.Item current>{trail.label}</TdsBreadcrumbs.Item>
		</TdsBreadcrumbs>
	)
}

export declare namespace BreadcrumbsSlot {
	type Props = { className?: string | undefined }
}

type Trail = {
	label: string
	section?: { label: string; to: '/blocks' | '/tokens' } | undefined
}

function getTrail(pathname: string): Trail | undefined {
	const [, kind, id] = pathname.split('/')
	if (!id) return undefined
	if (kind === 'block')
		return { label: `Block ${id}`, section: { label: 'Blocks', to: '/blocks' } }
	if (kind === 'token')
		return { label: formatHex(id), section: { label: 'Tokens', to: '/tokens' } }
	if (kind === 'tx') return { label: `Transaction ${formatHex(id)}` }
	if (kind === 'receipt') return { label: `Receipt ${formatHex(id)}` }
	if (kind === 'address') return { label: `Address ${formatHex(id)}` }
	if (kind === 'policy') return { label: `Policy ${id}` }
	return undefined
}
