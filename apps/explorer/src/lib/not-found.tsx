import * as React from 'react'

type NotFoundContextValue = {
	isNotFoundPage: boolean
	setIsNotFoundPage: React.Dispatch<React.SetStateAction<boolean>>
}

const NotFoundContext = React.createContext<NotFoundContextValue>({
	isNotFoundPage: false,
	setIsNotFoundPage: () => {},
})

export function NotFoundProvider(
	props: NotFoundProvider.Props,
): React.JSX.Element {
	const { children } = props
	const [isNotFoundPage, setIsNotFoundPage] = React.useState(false)
	const value = React.useMemo<NotFoundContextValue>(
		() => ({
			isNotFoundPage,
			setIsNotFoundPage,
		}),
		[isNotFoundPage],
	)

	return (
		<NotFoundContext.Provider value={value}>
			{children}
		</NotFoundContext.Provider>
	)
}

export namespace NotFoundProvider {
	export interface Props {
		children: React.ReactNode
	}
}

export function useIsNotFoundPage(): boolean {
	return React.useContext(NotFoundContext).isNotFoundPage
}

export function useMarkNotFoundPage(): void {
	const { setIsNotFoundPage } = React.useContext(NotFoundContext)

	React.useEffect(() => {
		setIsNotFoundPage(true)

		return () => setIsNotFoundPage(false)
	}, [setIsNotFoundPage])
}
