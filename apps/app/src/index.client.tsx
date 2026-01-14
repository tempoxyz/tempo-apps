import { StartClient } from '@tanstack/react-start/client'
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'
import '#lib/i18n'

hydrateRoot(
	document,
	<React.StrictMode>
		<StartClient />
	</React.StrictMode>,
)
