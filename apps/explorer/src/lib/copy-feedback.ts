import * as React from 'react'

/**
 * Announces copy confirmations. `CopyFeedbackProvider` supplies a TDS toast;
 * without it, as in tests, the default does nothing.
 */
export const CopyFeedbackContext = React.createContext<(title: string) => void>(
	() => {},
)

export function useCopyFeedback(): (title: string) => void {
	return React.useContext(CopyFeedbackContext)
}
