import { StartClient } from '@tanstack/react-start/client'
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { isRtl } from '#lib/i18n'

const savedLang = localStorage.getItem('tempo-language')
if (savedLang) {
	document.documentElement.dir = isRtl(savedLang) ? 'rtl' : 'ltr'
}

hydrateRoot(
	document,
	<React.StrictMode>
		<StartClient />
	</React.StrictMode>,
)
