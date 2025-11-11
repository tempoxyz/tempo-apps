import {
	createFileRoute,
	useNavigate,
	useRouterState,
} from '@tanstack/react-router'
import { Hex } from 'ox'

export const Route = createFileRoute('/_layout/')({
	component: Component,
})

export function Component() {
	const navigate = useNavigate()
	const state = useRouterState()

	return (
		<div className="flex flex-1 size-full items-center justify-center font-mono text-[13px]">
			<div className="flex flex-col gap-6 max-w-[420px] w-full text-center size-full">
				<h1 className="text-4xl font-bold italic text-primary">Explore</h1>
				<form
					onSubmit={(e) => {
						e.preventDefault()
						const formData = new FormData(e.currentTarget)
						const value = formData.get('value')
						Hex.assert(value)
						navigate({
							to: '/$value',
							params: { value },
						})
					}}
				>
					<div className="flex gap-2 w-full px-2 sm:px-0">
						<input
							// biome-ignore lint/a11y/noAutofocus: _
							autoFocus
							className="bg-surface border border-dashed h-7 px-3 py-2 w-full focus:outline-inverse focus:outline-solid focus:outline-[1.5px] focus:border-transparent box-content placeholder:text-primary text-primary"
							name="value"
							placeholder="Address or Tx Hash"
							type="text"
							spellCheck={false}
							autoCapitalize="off"
							autoComplete="off"
							autoCorrect="off"
						/>
						<button
							disabled={state.isLoading}
							className="bg-surface border border-dashed focus:outline-outline-inverse focus:outline-solid focus:border-transparent box-content px-4 disabled:opacity-50 text-primary active:outline-primary"
							type="submit"
						>
							{state.isLoading ? '…' : 'Go'}
						</button>
					</div>
				</form>
			</div>
		</div>
	)
}
