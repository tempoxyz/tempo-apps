import type { PropsWithChildren } from 'react'

const LAYOUT_PADDING = 20 // px, desktop spacing all around

export function Layout(props: PropsWithChildren) {
	return (
		<main
			id="main-content"
			className="mx-auto flex min-h-dvh max-md:flex-col"
			{...props}
		/>
	)
}

export namespace Layout {
	export function Hero(props: PropsWithChildren) {
		return (
			<div
				className="fixed w-[40vw] max-md:hidden"
				style={{
					top: LAYOUT_PADDING,
					left: LAYOUT_PADDING,
					bottom: LAYOUT_PADDING,
				}}
				{...props}
			/>
		)
	}

	export function Content(props: PropsWithChildren) {
		return (
			<div
				className="flex w-full flex-1 flex-col md:ml-[calc(40vw+100px)] md:pt-[20px] md:pb-[20px] md:pr-[20px] max-md:pt-3 max-md:pb-0"
			>
				<div className="flex w-full flex-1 flex-col max-md:px-3">
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
		if (!left && !right) return null
		return (
			<div className="flex items-center justify-between min-h-[44px] max-md:hidden">
				<div>{left}</div>
				{right}
			</div>
		)
	}
}
