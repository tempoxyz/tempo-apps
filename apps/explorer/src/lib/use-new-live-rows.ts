import * as React from 'react'

type Key = string | number

/** Track row identity across refreshes, without flashing the initial page or resumed feed. */
export function useNewLiveRows(
	keys: (Key | undefined)[],
	scope: string | undefined,
) {
	const signature = JSON.stringify(keys)
	const [previous, setPrevious] = React.useState(() => ({
		signature,
		scope,
		keys: new Set(keys),
		added: new Set<Key>(),
	}))
	if (previous.signature !== signature || previous.scope !== scope) {
		const added = new Set<Key>()
		if (
			scope !== undefined &&
			previous.scope === scope &&
			previous.keys.size > 0
		) {
			for (const key of keys)
				if (key !== undefined && !previous.keys.has(key)) added.add(key)
		}
		setPrevious({ signature, scope, keys: new Set(keys), added })
		return added
	}
	return previous.added
}
