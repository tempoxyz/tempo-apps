import {
	createFileRoute,
	useNavigate,
	useRouterState,
} from '@tanstack/react-router'
import { ListCheck } from 'lucide-react'
import { Hex } from 'ox'

export const Route = createFileRoute('/explore/')({
	component: Component,
})

export function Component() {
	const navigate = useNavigate()
	const state = useRouterState()

	return (
		<div className="font-mono text-[13px] flex flex-col min-h-screen items-center justify-center gap-4">
			<div className="flex flex-col gap-6 max-w-[420px] w-full text-center">
				<h1 className="text-4xl font-bold italic">Tempo Explorer</h1>
				<form
					onSubmit={(e) => {
						e.preventDefault()
						const formData = new FormData(e.currentTarget)
						const value = formData.get('value')
						Hex.assert(value)
						navigate({
							to: '/explore/$value',
							params: { value },
						})
					}}
				>
					<div className="flex gap-2 w-full">
						<input
							// biome-ignore lint/a11y/noAutofocus: _
							autoFocus
							className="bg-surface border border-dashed p-1 w-full focus:outline-inverse focus:outline-solid focus:border-transparent box-content"
							name="value"
							placeholder="Address or Tx Hash"
							type="text"
						/>
						<button
							disabled={state.isLoading}
							className="border border-dashed focus:outline-inverse focus:outline-solid focus:border-transparent box-content px-4 disabled:opacity-50"
							type="submit"
						>
							{state.isLoading ? '…' : 'Go'}
						</button>
					</div>
				</form>
				<div className="flex flex-col gap-2 items-center">
					<button
						type="button"
						hidden
						className="flex items-center bg-surface px-2 py-1 gap-2 hover:bg-surface/30 transition-colors"
					>
						<ListCheck className="size-4 text-[#4fa4f9]" />
						<span>Valid transaction, found in block 12331</span>
					</button>
				</div>
			</div>
		</div>
	)
}
