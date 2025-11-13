export function Footer() {
	return (
		<footer className="pt-[24px] pb-[48px] relative z-1">
			<ul className="flex items-center justify-center gap-[24px] text-[15px] text-base-content-secondary">
				<Footer.Link href="https://tempo.xyz">About</Footer.Link>
				<Footer.Link href="https://docs.tempo.xyz">Documentation</Footer.Link>
				<Footer.Link href="https://github.com/tempoxyz">GitHub</Footer.Link>
			</ul>
		</footer>
	)
}

export namespace Footer {
	export function Link({ href, children }: Link.Props) {
		return (
			<li className="flex">
				<a
					href={href}
					target="_blank"
					rel="noopener noreferrer"
					className="hover:text-primary transition-[color] active:translate-y-[.5px]"
				>
					{children}
				</a>
			</li>
		)
	}

	export namespace Link {
		export interface Props {
			href: string
			children: React.ReactNode
		}
	}
}
