import * as React from 'react'

const MicroPrecisionContext = React.createContext(false)

export function MicroPrecisionProvider(props: {
	value: boolean
	children: React.ReactNode
}) {
	return (
		<MicroPrecisionContext.Provider value={props.value}>
			{props.children}
		</MicroPrecisionContext.Provider>
	)
}

export function useMicroPrecision() {
	return React.useContext(MicroPrecisionContext)
}
