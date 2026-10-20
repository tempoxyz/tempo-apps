import { Toast } from '@tempoxyz/ds'
import * as React from 'react'
import { CopyFeedbackContext } from '#lib/copy-feedback'

/** Shows copy confirmations from `useCopy` as a TDS toast. */
export function CopyFeedbackProvider(
	props: CopyFeedbackProvider.Props,
): React.JSX.Element {
	return (
		<Toast.Provider limit={1} timeout={1_500}>
			<Notifier>{props.children}</Notifier>
			<Toast.Viewport />
		</Toast.Provider>
	)
}

export declare namespace CopyFeedbackProvider {
	type Props = { children: React.ReactNode }
}

function Notifier(props: { children: React.ReactNode }): React.JSX.Element {
	// `useToast` returns a new object each render; keep the context stable.
	const current = Toast.useToast()
	const toast = React.useRef(current)
	toast.current = current
	const notify = React.useCallback(
		(title: string) => toast.current.add({ title }),
		[],
	)

	return (
		<CopyFeedbackContext.Provider value={notify}>
			{props.children}
		</CopyFeedbackContext.Provider>
	)
}
