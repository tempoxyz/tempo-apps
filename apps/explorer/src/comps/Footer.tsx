import { Link as RouterLink } from '@tanstack/react-router'
import { AppMode } from '#lib/app-context.tsx'

const TEMPO_ENV = import.meta.env.VITE_TEMPO_ENV || 'testnet'

function getExplorerUrl(): string {
	if (TEMPO_ENV === 'devnet') return 'https://explorer.devnet.tempo.xyz'
	if (TEMPO_ENV === 'moderato') return 'https://explorer.moderato.tempo.xyz'
	return 'https://explorer.tempo.xyz'
}

function getFaucetUrl(): string {
	if (TEMPO_ENV === 'devnet') return 'https://faucet.devnet.tempo.xyz'
	if (TEMPO_ENV === 'moderato') return 'https://faucet.moderato.tempo.xyz'
	return 'https://faucet.tempo.xyz'
}

export function Footer(props: Footer.Props) {
	const { appMode = AppMode.Explorer } = props
	const isFaucet = appMode === AppMode.Faucet

	return (
		<footer className="pt-[24px] pb-[48px] relative print:hidden">
			<ul className="flex items-center justify-center gap-[24px] text-[15px] text-base-content-secondary select-none">
				{isFaucet ? (
					<>
						<Footer.Link to={getExplorerUrl()} external>
							Explorer
						</Footer.Link>
						<Footer.Link to="https://docs.tempo.xyz" external>
							Documentation
						</Footer.Link>
						<Footer.Link to="https://tempo.xyz" external>
							About
						</Footer.Link>
					</>
				) : (
					<>
						<Footer.Link to={getFaucetUrl()} external>
							Faucet
						</Footer.Link>
						<Footer.Link to="https://docs.tempo.xyz" external>
							Documentation
						</Footer.Link>
						<Footer.Link to="https://github.com/tempoxyz" external>
							GitHub
						</Footer.Link>
					</>
				)}
			</ul>
		</footer>
	)
}

export namespace Footer {
	export interface Props {
		appMode?: AppMode
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
}
