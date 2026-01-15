import type { PropsWithChildren } from 'react'

export function Layout(props: PropsWithChildren) {
	return (
		<main
			id="main-content"
			className="mx-auto flex min-h-dvh max-lg:flex-col"
			{...props}
		/>
	)
}

export namespace Layout {
	export function Hero(props: PropsWithChildren) {
		return (
			<div
				className="fixed inset-2 w-[45vw] max-lg:relative max-lg:inset-0 max-lg:w-full max-lg:h-auto"
				{...props}
			/>
		)
	}

	export function Content(props: PropsWithChildren) {
		return (
			<div
				className="ml-[calc(45vw+8px)] flex w-full flex-1 flex-col py-3 max-md:py-2 max-lg:ml-0"
				{...props}
			>
				<div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 max-sm:px-4">
					{props.children}
				</div>
			</div>
		)
	}

	export function Header(props: {
		left?: React.ReactNode
		right?: React.ReactNode
	}) {
		const { left, right } = props
		return (
			<div className="flex items-center justify-between">
				<div className="min-lg:opacity-0">{left}</div>
				{right}
			</div>
		)
	}
}
