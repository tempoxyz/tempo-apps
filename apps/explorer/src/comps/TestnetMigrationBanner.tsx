import { isTestnet } from '#lib/env'
import TriangleAlert from '~icons/lucide/triangle-alert'

const TESTNET_MIGRATION_BANNER_HIDE_AFTER_MS = 1773064800000

function shouldShowTestnetMigrationBanner(nowMs: number = Date.now()): boolean {
	return isTestnet() && nowMs <= TESTNET_MIGRATION_BANNER_HIDE_AFTER_MS
}

export function TestnetMigrationBanner(): React.JSX.Element | null {
	if (!shouldShowTestnetMigrationBanner()) return null

	return (
		<div className="bg-base-alt px-[32px] py-[8px] text-sm text-primary text-center">
			<TriangleAlert className="size-4 inline mr-[4px] relative top-[-1px]" />
			<span>
				<strong>Testnet migration:</strong> Tempo launched a new testnet
				(Moderato) on January 8th. The old testnet (Andantino) will be
				deprecated on{' '}
				<time dateTime="2026-03-08" title="March 8th, 2026">
					March 8th
				</time>
				.{' '}
				<a
					href="https://docs.tempo.xyz/#testnet-migration"
					className="underline press-down-inline"
					target="_blank"
					rel="noopener noreferrer"
				>
					Read the docs
				</a>{' '}
				for more details.
			</span>
		</div>
	)
}
