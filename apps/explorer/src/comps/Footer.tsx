import { Link as RouterLink } from '@tanstack/react-router'

export function Footer() {
	return (
		<footer className="pt-[24px] pb-[48px] relative print:hidden">
			<ul className="text-ui-meta flex items-center justify-center gap-[24px] select-none">
				<Footer.Link to="https://tempo.xyz" external>
					About
				</Footer.Link>
				<Footer.Link to="https://docs.tempo.xyz" external>
					Docs
				</Footer.Link>
				<Footer.Link to="https://github.com/tempoxyz" external>
					GitHub
				</Footer.Link>
				<Footer.Link
					to="https://github.com/tempoxyz/tempo-apps/discussions/categories/explorer"
					external
				>
					Feedback
				</Footer.Link>
			</ul>
		</footer>
	)
}

export namespace Footer {
	export function Link(props: Link.Props) {
		const { to, params, children, external } = props
		return (
			<li className="flex">
				<RouterLink
					to={to}
					params={params}
					className="press-down"
					target={external ? '_blank' : undefined}
					rel={external ? 'noopener noreferrer' : undefined}
				>
					{children}
				</RouterLink>
			</li>
		)
	}

	export namespace Link {
		export interface Props {
			to: string
			params?: Record<string, string>
			children: React.ReactNode
			external?: boolean
		}
	}
}
