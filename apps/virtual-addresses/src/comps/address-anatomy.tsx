import type * as React from 'react'

export function AddressAnatomy(props: AddressAnatomy.Props): React.JSX.Element {
	const { address } = props

	// Virtual address: [0x][4-byte masterId][10-byte magic][6-byte userTag]
	// Hex positions:   [0:2][2:10][10:30][30:42]
	const prefix = address.slice(0, 2)
	const masterId = address.slice(2, 10)
	const magic = address.slice(10, 30)
	const userTag = address.slice(30, 42)

	return (
		<div className="space-y-2">
			<div className="font-mono text-sm break-all leading-relaxed">
				<span className="text-text-tertiary">{prefix}</span>
				<span className="text-master-id">{masterId}</span>
				<span className="text-virtual-magic">{magic}</span>
				<span className="text-user-tag">{userTag}</span>
			</div>
			<div className="flex gap-4 text-xs">
				<span className="flex items-center gap-1.5">
					<span className="w-2 h-2 rounded-full bg-master-id" />
					<span className="text-text-secondary">masterId</span>
				</span>
				<span className="flex items-center gap-1.5">
					<span className="w-2 h-2 rounded-full bg-virtual-magic" />
					<span className="text-text-secondary">magic</span>
				</span>
				<span className="flex items-center gap-1.5">
					<span className="w-2 h-2 rounded-full bg-user-tag" />
					<span className="text-text-secondary">userTag</span>
				</span>
			</div>
		</div>
	)
}

export declare namespace AddressAnatomy {
	type Props = {
		address: string
	}
}
