import { memo, useRef, useEffect, useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { FlowNodeData } from './graph-model'

function NodeTooltip(props: {
	tooltip?: string
	children: React.ReactNode
}): React.JSX.Element {
	const [show, setShow] = useState(false)

	if (!props.tooltip) return <>{props.children}</>

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: tooltip hover behavior
		<div
			className="va-tooltip-wrap"
			onMouseEnter={() => setShow(true)}
			onMouseLeave={() => setShow(false)}
		>
			{props.children}
			{show && <div className="va-tooltip">{props.tooltip}</div>}
		</div>
	)
}

export const FlowCardNode = memo(
	({ data }: { data: FlowNodeData }): React.JSX.Element => {
		const ref = useRef<HTMLDivElement>(null)
		const prevStatus = useRef(data.status)

		useEffect(() => {
			if (!ref.current) return
			if (data.status === 'active' && prevStatus.current !== 'active') {
				ref.current.style.transform = 'scale(0.95)'
				ref.current.style.opacity = '0.5'
				requestAnimationFrame(() => {
					if (!ref.current) return
					ref.current.style.transition =
						'transform 0.4s ease-out, opacity 0.4s ease-out'
					ref.current.style.transform = 'scale(1)'
					ref.current.style.opacity = '1'
				})
			}
			prevStatus.current = data.status
		}, [data.status])

		return (
			<div ref={ref}>
				{/* Handles — all four sides + extra positions */}
				<Handle
					type="source"
					position={Position.Top}
					id="top"
					className="va-handle"
				/>
				<Handle
					type="target"
					position={Position.Top}
					id="top"
					className="va-handle"
				/>
				<Handle
					type="source"
					position={Position.Right}
					id="right"
					className="va-handle"
				/>
				<Handle
					type="target"
					position={Position.Right}
					id="right"
					className="va-handle"
				/>
				<Handle
					type="source"
					position={Position.Bottom}
					id="bottom"
					className="va-handle"
				/>
				<Handle
					type="target"
					position={Position.Bottom}
					id="bottom"
					className="va-handle"
				/>
				<Handle
					type="source"
					position={Position.Left}
					id="left"
					className="va-handle"
				/>
				<Handle
					type="target"
					position={Position.Left}
					id="left"
					className="va-handle"
				/>
				{/* Extra handle for virtual → protocol diagonal */}
				<Handle
					type="source"
					position={Position.Right}
					id="top-right"
					className="va-handle"
					style={{ top: '25%' }}
				/>

				<NodeTooltip tooltip={data.tooltip}>
					<div className="va-card" data-status={data.status}>
						<div className="va-card__head">
							<div className="va-card__name">{data.label}</div>
							{data.subtitle && (
								<div className="va-card__subtitle">{data.subtitle}</div>
							)}
						</div>
						{data.props && data.props.length > 0 && (
							<div className="va-card__footer">
								{data.props.map((p) => (
									<div key={p.key} className="va-card__metric">
										<span className="va-card__metric-label">{p.key}</span>
										<span className="va-card__metric-value">{p.value}</span>
									</div>
								))}
							</div>
						)}
					</div>
				</NodeTooltip>
			</div>
		)
	},
)
