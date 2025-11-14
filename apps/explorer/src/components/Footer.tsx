import { Link as RouterLink } from '@tanstack/react-router'
import { useBlock } from 'wagmi'

function DemoLinks() {
	const { data: block } = useBlock()
	const txes = block?.transactions.slice(0, 2)
	return (
		<>
			<Footer.Link
				to="/account/$address"
				params={{ address: '0x5bc1473610754a5ca10749552b119df90c1a1877' }}
			>
				Account
			</Footer.Link>
			{Array.from({ length: 2 }, (_, index) => {
				const hash = txes?.[index]
				const label = `Receipt ${index + 1}`
				const key = hash ?? String(index)
				return hash ? (
					<Footer.Link to="/tx/$hash" params={{ hash }} key={key}>
						{label}
					</Footer.Link>
				) : (
					<span className="select-none opacity-50" key={key}>
						{label}
					</span>
				)
			})}
		</>
	)
}

export function Footer() {
	return (
		<footer className="pt-[24px] pb-[48px] relative z-1">
			<ul className="flex items-center justify-center gap-[24px] text-[15px] text-base-content-secondary">
				{/* <Footer.Link to="https://tempo.xyz" external>About</Footer.Link> */}
				{/* <Footer.Link to="https://docs.tempo.xyz" external>Documentation</Footer.Link> */}
				{/* <Footer.Link to="https://github.com/tempoxyz" external>GitHub</Footer.Link> */}
				<DemoLinks />
			</ul>
		</footer>
	)
}

export namespace Footer {
	export function Link({ to, params, children, external }: Link.Props) {
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
