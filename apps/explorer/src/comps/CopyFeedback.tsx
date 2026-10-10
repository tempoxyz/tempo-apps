import { style, Toast } from '@tempoxyz/ds/platform'
import * as React from 'react'
import { CopyFeedbackContext } from '#lib/copy-feedback'

/** Shows copy confirmations from `useCopy` as a TDS toast. */
export function CopyFeedbackProvider(
	props: CopyFeedbackProvider.Props,
): React.JSX.Element {
	return (
		<Toast.Provider limit={1} timeout={1_500}>
			<Notifier>{props.children}</Notifier>
			<Toasts />
		</Toast.Provider>
	)
}

export declare namespace CopyFeedbackProvider {
	type Props = { children: React.ReactNode }
}

function Notifier(props: { children: React.ReactNode }): React.JSX.Element {
	// `useManager` returns new functions each render; keep the context stable.
	const current = Toast.useManager()
	const manager = React.useRef(current)
	manager.current = current
	const notify = React.useCallback(
		(title: string) => manager.current.add({ title }),
		[],
	)

	return (
		<CopyFeedbackContext.Provider value={notify}>
			{props.children}
		</CopyFeedbackContext.Provider>
	)
}

function Toasts(): React.JSX.Element {
	const { toasts } = Toast.useManager()

	return (
		<Toast.Viewport {...styles.viewport()}>
			{toasts.map((toast) => (
				<Toast key={toast.id} toast={toast} />
			))}
		</Toast.Viewport>
	)
}

namespace styles {
	export const viewport = style({
		bottom: '24',
		left: '50% !custom',
		position: 'fixed',
		translate: '-50% 0 !custom',
		zIndex: 50,
	})
}
