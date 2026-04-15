import { useState, useEffect, useRef, useMemo } from 'react'
import {
	ReactFlow,
	ReactFlowProvider,
	useReactFlow,
	type NodeTypes,
	type EdgeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './flow/styles.css'

import { useWalkthroughStore } from '#store/walkthrough-store'
import type { FlowStep } from '#lib/walkthrough-types'
import {
	STEPS,
	STEP_PARTICIPANTS,
	STEP_FOCUS,
	buildNodes,
	buildEdges,
} from './flow/graph-model'
import { FlowCardNode } from './flow/nodes'
import { AnimatedEdge } from './flow/animated-edge'

const nodeTypes: NodeTypes = {
	'flow-card': FlowCardNode,
}

const edgeTypes: EdgeTypes = {
	animated: AnimatedEdge,
}

function WalkthroughDemoInner(): React.JSX.Element {
	const step = useWalkthroughStore((s) => s.step)
	const isPlaying = useWalkthroughStore((s) => s.isPlaying)
	const isBusy = useWalkthroughStore((s) => s.isBusy)
	const error = useWalkthroughStore((s) => s.error)
	const phase = useWalkthroughStore((s) => s.phase)
	const data = useWalkthroughStore((s) => s.data)
	const advance = useWalkthroughStore((s) => s.advance)
	const goToStep = useWalkthroughStore((s) => s.goToStep)
	const togglePlay = useWalkthroughStore((s) => s.togglePlay)
	const reset = useWalkthroughStore((s) => s.reset)

	const { fitView } = useReactFlow()
	const containerRef = useRef<HTMLDivElement>(null)
	const [activeKey, setActiveKey] = useState<string | null>(null)
	const activeKeyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

	const currentStep = STEPS[step]
	const isComplete = step >= 6

	// Build nodes and edges
	const nodes = useMemo(() => buildNodes(step, data), [step, data])
	const edges = useMemo(
		() => buildEdges(step, data, phase),
		[step, data, phase],
	)

	// At step 0 only show exchange node. Otherwise apply dimming.
	const dimmedNodes = useMemo(() => {
		if (step === 0) return nodes.filter((n) => n.id === 'exchange')
		const participants = STEP_PARTICIPANTS[step]
		if (!participants) return nodes
		return nodes.map((n) => {
			if (
				participants.includes(n.id) ||
				n.data.status === 'active' ||
				n.data.status === 'done'
			)
				return n
			return {
				...n,
				data: {
					...n.data,
					status: 'idle' as const,
				},
			}
		})
	}, [nodes, step])

	const visibleEdges = useMemo(() => (step === 0 ? [] : edges), [step, edges])

	// Fit on mount
	useEffect(() => {
		const t = setTimeout(
			() =>
				fitView({
					nodes: [{ id: 'exchange' }],
					padding: 1.2,
					duration: 400,
				}),
			60,
		)
		return () => clearTimeout(t)
	}, [fitView])

	// Zoom to focus nodes on step change
	useEffect(() => {
		const focus = STEP_FOCUS[step]
		const t = setTimeout(() => {
			if (focus) {
				fitView({
					nodes: focus.nodes.map((id) => ({ id })),
					padding: focus.padding,
					duration: 600,
				})
			} else {
				fitView({ padding: 0.15, duration: 600 })
			}
		}, 80)
		return () => clearTimeout(t)
	}, [step, fitView])

	// Keyboard navigation
	useEffect(() => {
		const flash = (key: string) => {
			if (activeKeyTimer.current) clearTimeout(activeKeyTimer.current)
			setActiveKey(key)
			activeKeyTimer.current = setTimeout(() => setActiveKey(null), 1000)
		}

		const onDown = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement)?.tagName
			if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

			if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
				e.preventDefault()
				flash('right')
				if (!isBusy && step < 6) advance()
			} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
				e.preventDefault()
				flash('left')
				if (!isBusy && step > 0) {
					goToStep(Math.max(step - 1, 0) as FlowStep)
				}
			} else if (e.key === ' ') {
				e.preventDefault()
				flash('space')
				if (!isBusy) togglePlay()
			}
		}

		window.addEventListener('keydown', onDown)
		return () => {
			window.removeEventListener('keydown', onDown)
			if (activeKeyTimer.current) clearTimeout(activeKeyTimer.current)
		}
	}, [advance, togglePlay, isBusy, step, goToStep])

	return (
		<div className="va-demo" ref={containerRef}>
			{/* Demo label header */}
			<div className="va-demo__header">
				<span className="va-demo__label">
					DEMO — TIP-1022 Virtual Address Resolution
					{isBusy && <span className="va-sending-dot" />}
				</span>
			</div>

			{/* Controls bar */}
			<div className="va-controls">
				{step > 0 ? (
					<span className="va-controls__label">
						<span className="va-controls__counter">
							{step}/{STEPS.length - 1}
						</span>
						<span className="va-controls__step-title">{currentStep.label}</span>
						{isBusy && <span className="va-sending-dot" />}
					</span>
				) : (
					<span style={{ flex: 1 }} />
				)}

				<div className="va-controls__buttons">
					{step > 0 && !isComplete && (
						<button
							type="button"
							className="va-icon-btn"
							onClick={reset}
							title="Restart"
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M1 4v6h6" />
								<path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
							</svg>
						</button>
					)}
					{isPlaying ? (
						<button
							type="button"
							className="va-icon-btn va-icon-btn--primary"
							onClick={togglePlay}
							title="Pause"
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
								strokeLinecap="round"
							>
								<rect x="6" y="4" width="4" height="16" />
								<rect x="14" y="4" width="4" height="16" />
							</svg>
						</button>
					) : isComplete ? (
						<button
							type="button"
							className="va-icon-btn va-icon-btn--primary"
							onClick={reset}
							title="Run again"
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M1 4v6h6" />
								<path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
							</svg>
						</button>
					) : (
						<button
							type="button"
							className="va-icon-btn va-icon-btn--primary"
							onClick={advance}
							disabled={isBusy}
							title={
								step === 0
									? 'Start demo'
									: isBusy
										? 'Settling on-chain…'
										: 'Next step'
							}
						>
							{isBusy ? (
								<span className="va-icon-btn__spinner" />
							) : (
								<svg
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2.5"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M5 12h14" />
									<path d="M13 6l6 6-6 6" />
								</svg>
							)}
						</button>
					)}
				</div>
			</div>

			{/* Step description */}
			{step > 0 && (
				<div className="va-step-desc">
					<p>{currentStep.description}</p>
				</div>
			)}

			{/* Error banner */}
			{error && (
				<div className="va-error">
					<span>{error}</span>
					<button
						type="button"
						onClick={reset}
						className="text-xs text-text-tertiary hover:text-text-secondary"
					>
						Reset
					</button>
				</div>
			)}

			{/* React Flow canvas */}
			<div className="va-canvas-wrap">
				<ReactFlow
					nodes={dimmedNodes}
					edges={visibleEdges}
					nodeTypes={nodeTypes}
					edgeTypes={edgeTypes}
					fitView
					fitViewOptions={{ padding: 0.15 }}
					nodesDraggable={false}
					nodesConnectable={false}
					elementsSelectable={false}
					panOnDrag={false}
					zoomOnScroll={false}
					zoomOnPinch={false}
					zoomOnDoubleClick={false}
					preventScrolling={false}
					proOptions={{ hideAttribution: true }}
					minZoom={0.25}
					maxZoom={1.5}
				/>
				<div
					className={`va-kbd-hint${activeKey ? ' va-kbd-hint--active' : ''}`}
				>
					<kbd className={activeKey === 'left' ? 'va-kbd--pressed' : ''}>
						&larr;
					</kbd>
					<kbd className={activeKey === 'right' ? 'va-kbd--pressed' : ''}>
						&rarr;
					</kbd>
					<span>Navigate</span>
					<kbd className={activeKey === 'space' ? 'va-kbd--pressed' : ''}>
						Space
					</kbd>
					<span>Autoplay</span>
				</div>
				<div className="va-canvas-badge">
					<svg width="14" height="14" viewBox="0 0 128 128" fill="none">
						<path
							d="M52.2137 104H30.5904L50.6315 42.1333H25L30.5904 24H102L96.4096 42.1333H72.1493L52.2137 104Z"
							fill="currentColor"
						/>
					</svg>
					<span>TIP-1022 Virtual Addresses on Tempo</span>
				</div>
			</div>

			{/* Timeline */}
			<div className="va-timeline">
				<div className="va-timeline__steps">
					<div className="va-timeline__bar">
						<div
							className="va-timeline__fill"
							style={{
								width: `${(step / (STEPS.length - 1)) * 100}%`,
							}}
						/>
					</div>
					{STEPS.map((s) => (
						<button
							key={s.id}
							type="button"
							className={`va-timeline__step ${step === s.id ? 'va-timeline__step--active' : ''} ${step > s.id ? 'va-timeline__step--done' : ''}`}
							onClick={() => goToStep(s.id)}
							title={s.label}
						>
							<span className="va-timeline__dot" />
							<span className="va-timeline__step-label">
								{s.id === 0 ? 'Start' : s.id === 6 ? 'Done' : s.id}
							</span>
						</button>
					))}
				</div>
			</div>
		</div>
	)
}

export function WalkthroughDemo(): React.JSX.Element {
	return (
		<ReactFlowProvider>
			<WalkthroughDemoInner />
		</ReactFlowProvider>
	)
}
