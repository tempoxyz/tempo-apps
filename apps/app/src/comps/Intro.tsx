import { Header } from './Header'

export function Intro() {
	return (
		<div className="relative flex min-h-full flex-col items-start justify-end rounded-[10px] bg-card border border-card-border px-5 py-4 shadow-[0px_4px_44px_rgba(0,0,0,0.05)]">
			<div className="flex flex-col items-start gap-y-2">
				<Header.TempoWordmark />
				<p className="font-normal text-[17px] leading-[24px] text-secondary">
					View account details
					<br />
					on the <span className="font-medium text-primary">Tempo</span>{' '}
					network.
				</p>
				<ul className="flex gap-x-1 text-tertiary [&>li:not(:first-child)]:before:content-['⋅'] [&>li:not(:first-child)]:before:mr-1 mt-1">
					<li>
						<a
							className="font-[500] text-[13px] hover:text-primary transition-colors"
							href="https://tempo.xyz"
							rel="noreferrer"
							target="_blank"
						>
							Tempo
						</a>
					</li>
					<li>
						<a
							className="font-[500] text-[13px] hover:text-primary transition-colors"
							href="https://docs.tempo.xyz"
							rel="noreferrer"
							target="_blank"
						>
							Docs
						</a>
					</li>
				</ul>
			</div>
		</div>
	)
}
