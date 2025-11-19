import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ExploreInput } from '#components/ExploreInput'
import { Intro } from '#components/Intro'

export const Route = createFileRoute('/_layout/')({
	component: Component,
})

export function Component() {
	const navigate = useNavigate()
	const [inputValue, setInputValue] = useState('')

	return (
		<div className="flex flex-1 size-full items-center justify-center text-[16px]">
			<div className="grid place-items-center relative grid-flow-row gap-[20px] select-none w-full pt-[60px] pb-[40px] z-1">
				<Intro />
				<p className="text-base-content-secondary max-w-[260px] text-center">
					View account history and transaction details on Tempo.
				</p>
				<div className="px-[16px] w-full flex justify-center">
					<ExploreInput
						autoFocus
						size="large"
						value={inputValue}
						onChange={setInputValue}
						onActivate={() => {
							// TODO: search screen?
							// navigate({ to: '/search/$value', params: { value } })
						}}
						onAddress={(address) => {
							navigate({ to: '/account/$address', params: { address } })
						}}
						onHash={(hash) => {
							navigate({ to: '/tx/$hash', params: { hash } })
						}}
					/>
				</div>
			</div>
		</div>
	)
}
