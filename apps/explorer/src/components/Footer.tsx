import { Link as RouterLink } from '@tanstack/react-router'

export function Footer() {
	return (
		<footer className="pt-[24px] pb-[48px] relative">
			<ul className="flex items-center justify-center gap-[24px] text-[15px] text-base-content-secondary select-none">
				<Footer.Link to="https://tempo.xyz" external>
					About
				</Footer.Link>
				<Footer.Link to="https://docs.tempo.xyz" external>
					Documentation
				</Footer.Link>
				<Footer.Link to="https://github.com/tempoxyz" external>
					GitHub
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
