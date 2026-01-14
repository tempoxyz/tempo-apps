import { StartClient } from '@tanstack/react-start/client'
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'

hydrateRoot(
	document,
	<React.StrictMode>
		<StartClient />
	</React.StrictMode>,
)
