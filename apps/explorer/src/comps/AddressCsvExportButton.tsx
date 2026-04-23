import type { Address } from 'ox'
import * as React from 'react'

import { cx } from '#lib/css'
import { getApiUrl } from '#lib/env.ts'
import type { HistorySources } from '#lib/queries/account'
import DownloadIcon from '~icons/lucide/download'

function getDownloadFilename(
	contentDisposition: string | null,
	fallback: string,
): string {
	if (!contentDisposition) return fallback

	const match = /filename="([^"]+)"/.exec(contentDisposition)
	return match?.[1] ?? fallback
}

export function AddressCsvExportButton(
	props: AddressCsvExportButton.Props,
): React.JSX.Element {
	const { address, kind } = props
	const status = kind === 'transactions' ? props.status : undefined
	const include = kind === 'transactions' ? props.include : 'all'
	const after = kind === 'transactions' ? props.after : undefined
	const sources = kind === 'transactions' ? props.sources : []
	const [isExporting, setIsExporting] = React.useState(false)
	const [error, setError] = React.useState<string | null>(null)

	const handleExport = React.useCallback(async () => {
		setIsExporting(true)
		setError(null)

		try {
			const searchParams = new URLSearchParams({ format: 'csv' })
			searchParams.set('sort', 'desc')

			let url: URL
			let fallbackFilename: string

			if (kind === 'balances') {
				url = getApiUrl(`/api/address/balances/${address}`)
				fallbackFilename = `balances-${address.toLowerCase()}.csv`
			} else {
				url = getApiUrl(`/api/address/history/${address}`)
				fallbackFilename = `transactions-${address.toLowerCase()}.csv`

				if (status) searchParams.set('status', status)
				if (include !== 'all') searchParams.set('include', include)
				if (after) searchParams.set('after', String(after))
				if (sources.length > 0) {
					searchParams.set('sources', sources.join(','))
				}
			}

			url.search = searchParams.toString()

			const response = await fetch(url, {
				headers: { Accept: 'text/csv' },
			})

			if (!response.ok) {
				throw new Error('Error')
			}

			const blob = await response.blob()
			const objectUrl = URL.createObjectURL(blob)

			try {
				const anchor = document.createElement('a')
				anchor.href = objectUrl
				anchor.download = getDownloadFilename(
					response.headers.get('Content-Disposition'),
					fallbackFilename,
				)
				document.body.appendChild(anchor)
				anchor.click()
				document.body.removeChild(anchor)
			} finally {
				URL.revokeObjectURL(objectUrl)
			}
		} catch (error) {
			setError(error instanceof Error ? error.message : 'Error')
		} finally {
			setIsExporting(false)
		}
	}, [address, after, include, kind, sources, status])

	return (
		<div className="flex flex-col gap-[4px] min-[800px]:items-end">
			<button
				type="button"
				onClick={handleExport}
				disabled={isExporting}
				aria-label={
					kind === 'balances'
						? 'Export balances as CSV'
						: 'Export transactions as CSV'
				}
				className={cx(
					'flex size-[28px] items-center justify-center rounded-[6px] border text-[12px] transition-colors',
					error
						? 'border-transparent text-red-400 hover:text-red-300 hover:bg-base-alt'
						: 'border-transparent text-tertiary hover:text-secondary hover:bg-base-alt',
					isExporting && 'cursor-default opacity-60',
					!isExporting && 'cursor-pointer',
				)}
				title={
					kind === 'balances'
						? 'Export balances as CSV'
						: 'Export transactions as CSV'
				}
			>
				<DownloadIcon className="size-[14px]" />
			</button>
			{error && <span className="text-[11px] text-red-400">Error</span>}
		</div>
	)
}

export declare namespace AddressCsvExportButton {
	type Props =
		| {
				address: Address.Address
				kind: 'balances'
		  }
		| {
				address: Address.Address
				kind: 'transactions'
				status?: 'success' | 'reverted' | undefined
				include: 'all' | 'sent' | 'received'
				after?: number | undefined
				sources: ReadonlyArray<HistorySources>
		  }
}
