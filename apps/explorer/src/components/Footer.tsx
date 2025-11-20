import { Link as RouterLink } from '@tanstack/react-router'
import type { Hex } from 'ox'

export function Footer(props: Footer.Props) {
	const { recentTransactions = [] } = props
	return (
		<footer className="pt-[24px] pb-[48px] relative z-1">
			<ul className="flex items-center justify-center gap-[24px] text-[15px] text-base-content-secondary select-none">
				{/* <Footer.Link to="https://tempo.xyz" external>About</Footer.Link> */}
				{/* <Footer.Link to="https://docs.tempo.xyz" external>Documentation</Footer.Link> */}
				{/* <Footer.Link to="https://github.com/tempoxyz" external>GitHub</Footer.Link> */}
				<Footer.DemoLinks hashes={recentTransactions} />
			</ul>
		</footer>
	)
}

export namespace Footer {
	export interface Props {
		recentTransactions?: Hex.Hex[]
	}

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

	export function DemoLinks(props: DemoLinks.Props) {
		const { hashes } = props
		return (
			<>
				<li>Demo:</li>
				<Footer.Link
					to="/account/$address"
					params={{ address: DemoLinks.demoAccount }}
				>
					Account
				</Footer.Link>
				<Footer.Link
					to="/token/$address"
					params={{ address: DemoLinks.demoToken }}
				>
					Token
				</Footer.Link>
				{hashes[0] ? (
					<Footer.Link to="/tx/$hash" params={{ hash: hashes[0] }}>
						Receipt
					</Footer.Link>
				) : (
					<span className="select-none opacity-50">Receipt</span>
				)}
			</>
		)
	}

	export namespace DemoLinks {
		export interface Props {
			hashes: Hex.Hex[]
		}

		export const demoAccount = '0x5bc1473610754a5ca10749552b119df90c1a1877'
		export const demoToken = '0x20c0000000000000000000000000000000000002'
	}
}
