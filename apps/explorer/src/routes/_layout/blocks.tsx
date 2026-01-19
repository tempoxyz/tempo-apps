import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import * as React from 'react'
import type { Block } from 'viem'
import { useBlock, useWatchBlockNumber } from 'wagmi'
import * as z from 'zod/mini'
import { DataGrid } from '#comps/DataGrid'
import { Midcut } from '#comps/Midcut'
import { Sections } from '#comps/Sections'
import {
  FormattedTimestamp,
  TimeColumnHeader,
  useTimeFormat,
} from '#comps/TimeFormat'
import { cx } from '#lib/css'
import { withLoaderTiming } from '#lib/profiling'
import { BLOCKS_PER_PAGE, blocksQueryOptions } from '#lib/queries'
import ChevronFirst from '~icons/lucide/chevron-first'
import ChevronLast from '~icons/lucide/chevron-last'
import ChevronLeft from '~icons/lucide/chevron-left'
import ChevronRight from '~icons/lucide/chevron-right'
import Play from '~icons/lucide/play'

// Track which block numbers are "new" for animation purposes
const recentlyAddedBlocks = new Set<string>()

export const Route = createFileRoute('/_layout/blocks')({
  component: RouteComponent,
  validateSearch: z.object({
    from: z.optional(z.coerce.number()),
    live: z.optional(z.coerce.boolean()),
  }),
  loaderDeps: ({ search: { from, live } }) => ({
    from,
    live: live ?? from == null,
  }),
  loader: ({ deps, context }) =>
    withLoaderTiming('/_layout/blocks', async () =>
      context.queryClient.ensureQueryData(blocksQueryOptions(deps.from))
    ),
})

function RouteComponent() {
  const search = Route.useSearch()
  const from = search.from
  const isAtLatest = from == null
  const live = search.live ?? isAtLatest
  const loaderData = Route.useLoaderData()

  const { data: queryData } = useQuery({
    ...blocksQueryOptions(from),
    initialData: loaderData,
  })

  const [latestBlockNumber, setLatestBlockNumber] = React.useState<bigint | undefined>()
  const currentLatest = latestBlockNumber ?? queryData.latestBlockNumber

  const [liveBlocks, setLiveBlocks] = React.useState<Block[]>(() =>
    queryData.blocks.slice(0, BLOCKS_PER_PAGE)
  )

  const lastBlockNumberRef = React.useRef<bigint | undefined>(undefined)

  const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()
  const [paused, setPaused] = React.useState(false)

  useWatchBlockNumber({
    onBlockNumber: (blockNumber) => {
      if (latestBlockNumber === undefined || blockNumber > latestBlockNumber) {
        setLatestBlockNumber(blockNumber)
      }
    },
    poll: true,
  })

  const { data: latestBlock } = useBlock({
    blockNumber: latestBlockNumber,
    query: {
      enabled: live && isAtLatest && latestBlockNumber !== undefined,
      staleTime: Number.POSITIVE_INFINITY,
    },
  })

  React.useEffect(() => {
    if (
      !live ||
      !isAtLatest ||
      !latestBlock ||
      paused ||
      lastBlockNumberRef.current === latestBlock.number
    ) {
      return
    }

    lastBlockNumberRef.current = latestBlock.number

    setLiveBlocks((prev) => {
      if (prev.some((b) => b.number === latestBlock.number)) return prev

      const blockNum = latestBlock.number?.toString()
      if (blockNum) {
        recentlyAddedBlocks.add(blockNum)
        setTimeout(() => recentlyAddedBlocks.delete(blockNum), 400)
      }

      return [latestBlock, ...prev].slice(0, BLOCKS_PER_PAGE)
    })
  }, [latestBlock, live, isAtLatest, paused])

  React.useEffect(() => {
    if (isAtLatest && live && queryData.blocks) {
      setLiveBlocks((prev) => {
        if (prev.length === 0) return queryData.blocks.slice(0, BLOCKS_PER_PAGE)
        return prev
      })
    }
  }, [isAtLatest, live, queryData.blocks])

  const blocks = React.useMemo(() => {
    if (isAtLatest && live && liveBlocks.length > 0) return liveBlocks
    return queryData.blocks
  }, [isAtLatest, live, liveBlocks, queryData.blocks])

  const isLoading = !blocks || blocks.length === 0
  const totalBlocks = currentLatest ? Number(currentLatest) + 1 : 0
  const displayedFrom = blocks[0]?.number ?? undefined
  const displayedEnd = blocks[blocks.length - 1]?.number ?? undefined

  const columns: DataGrid.Column[] = [
    { label: 'Block', width: '1fr', minWidth: 100 },
    { label: 'Hash', width: '8fr' },
    {
      align: 'end',
      label: (
        <TimeColumnHeader
          label="Time"
          formatLabel={formatLabel}
          onCycle={cycleTimeFormat}
        />
      ),
      width: '1fr',
      minWidth: 80,
    },
    { align: 'end', label: 'Txns', width: '1fr' },
  ]

  return (
    <div className="flex flex-col gap-6 px-4 pt-20 pb-16 max-w-300 mx-auto w-full">
      <Sections
        mode="tabs"
        sections={[
          {
            title: 'Blocks',
            totalItems: totalBlocks || undefined,
            autoCollapse: false,
            contextual: (
              <Link
                to="."
                resetScroll={false}
                search={(prev) => ({
                  ...prev,
                  live:
                    isAtLatest
                      ? !live
                        ? undefined
                        : false
                      : !live
                        ? true
                        : undefined,
                })}
                className={cx(
                  'flex items-center gap-[4px] px-[6px] py-[2px] rounded-[4px] text-[11px] font-medium press-down',
                  live && !paused
                    ? 'bg-positive/10 text-positive hover:bg-positive/20'
                    : 'bg-base-alt text-tertiary hover:bg-base-alt/80'
                )}
                title={live ? 'Pause live updates' : 'Resume live updates'}
              >
                {live && !paused ? (
                  <>
                    <span className="relative flex size-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-75" />
                      <span className="relative inline-flex rounded-full size-2 bg-positive" />
                    </span>
                    <span>Live</span>
                  </>
                ) : (
                  <>
                    <Play className="size-3" />
                    <span>Paused</span>
                  </>
                )}
              </Link>
            ),
            content: undefined, // fixed syntax error
          },
        ]}
        activeSection={0}
      />
    </div>
  )
}
