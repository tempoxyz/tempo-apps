import type * as React from 'react'
import { BentoGrid } from '#comps/bento/BentoGrid'
import { ActivityHeatmapTile } from '#comps/bento/tiles/ActivityHeatmapTile'
import { BlockTimeTile } from '#comps/bento/tiles/BlockTimeTile'
import { ChainIdTile } from '#comps/bento/tiles/ChainIdTile'
import { LatestBlockTile } from '#comps/bento/tiles/LatestBlockTile'
import { NewAssetsTile } from '#comps/bento/tiles/NewAssetsTile'
import { NotableTxsTile } from '#comps/bento/tiles/NotableTxsTile'
import { PopularCallsTile } from '#comps/bento/tiles/PopularCallsTile'
import { TopTokensTile } from '#comps/bento/tiles/TopTokensTile'
import { TpsTile } from '#comps/bento/tiles/TpsTile'
import { TvlOverTimeTile } from '#comps/bento/tiles/TvlOverTimeTile'
import { UptimeTile } from '#comps/bento/tiles/UptimeTile'
import { ValidatorsTile } from '#comps/bento/tiles/ValidatorsTile'

// Source order chosen so `grid-auto-flow: dense` packs every row fully at
// every breakpoint (base 2 cols / sm 4 cols / lg 6 cols). See plan v5.
export function LandingBento(): React.JSX.Element {
	return (
		<BentoGrid>
			<LatestBlockTile />
			<BlockTimeTile />
			<UptimeTile />
			<ActivityHeatmapTile />
			<TopTokensTile />
			<ChainIdTile />
			<TpsTile />
			<PopularCallsTile />
			<ValidatorsTile />
			<TvlOverTimeTile />
			<NewAssetsTile />
			<NotableTxsTile />
		</BentoGrid>
	)
}
