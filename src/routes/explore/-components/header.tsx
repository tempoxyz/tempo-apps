import { Link } from '@tanstack/react-router'
import { SquareSquare } from 'lucide-react'
import { useBlockNumber } from 'wagmi'

export function Header() {
	const { data: blockNumber } = useBlockNumber({ watch: true })

	return (
		<header className="px-4 md:px-8 lg:px-16 flex items-center justify-between min-h-16 pt-6">
			<Link to="/" className="flex items-center">
				<img src="/icons/watermark.svg" alt="Tempo" className="h-6" />
			</Link>
			<div className="flex items-center gap-2">
				<SquareSquare className="size-4 text-accent" />
				<span className="text-sm text-secondary">Block</span>
				<span className="text-sm text-primary font-medium tabular-nums">
					{blockNumber}
				</span>
			</div>
		</header>
	)
}
